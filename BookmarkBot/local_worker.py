"""
local_worker.py — Standalone local worker for testing.

Fetches jobs from the same Redis queue the VPS playwright worker uses
(REDIS_URL env var, queue name: backlink_queue), spawns a SeleniumBase
UC Mode browser per concurrent slot, and runs the PliggTemplate on each job.

Usage:
    Set REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TWOCAPTCHA_API_KEY in .env, then:
        python local_worker.py
"""

import os
import sys
import json
import time
import random
import asyncio
import logging
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor

import redis
from dotenv import load_dotenv
from seleniumbase import Driver
from supabase import create_client, Client

from pligg_template import PliggTemplate
from failure_handler import FailureHandler

load_dotenv()

# ─── Configuration ────────────────────────────────────────────────────────────
REDIS_URL           = os.getenv("REDIS_URL")
QUEUE_NAME          = "backlink_queue"
MAX_WORKERS         = int(os.getenv("MAX_CONCURRENT_SESSIONS", "1"))
PAGE_LOAD_TIMEOUT   = int(os.getenv("PAGE_LOAD_TIMEOUT", "60"))
WINDOW_WIDTH        = int(os.getenv("WINDOW_WIDTH", "1366"))
WINDOW_HEIGHT       = int(os.getenv("WINDOW_HEIGHT", "768"))
SUPABASE_URL        = os.getenv("SUPABASE_URL")
SUPABASE_KEY        = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")

# Initialize global Supabase client (can be shared across threads safely for REST calls)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("LocalWorker")

# Global tracker for rate limiter (stubbed for now, used by old check_and_update_parent_task)
NEXT_JOB_ALLOWED_TIME_GLOBAL = 0

# ─── Supabase Task State Helpers ──────────────────────────────────────────────
def mark_parent_task_running(supabase_client: Client, task_id: str):
    """Bumps a parent task's status from 'pending' to 'running' when a child task_run starts."""
    if not task_id:
        return
    try:
        supabase_client.table('tasks') \
            .update({'status': 'running'}) \
            .eq('id', task_id) \
            .eq('status', 'pending') \
            .execute()
    except Exception as e:
        logger.error(f"[Task {task_id}] Failed to mark parent task as running: {e}")

def check_and_update_parent_task(supabase_client: Client, state: dict):
    """Checks if all task_runs for a parent task are done, and if so, updates the parent task status."""
    task_id = state.get('task_id')
    if not task_id:
        return
    try:
        parent_res = supabase_client.table('tasks').select('status, result').eq('id', task_id).execute()
        if not parent_res.data:
            return
        parent_task = parent_res.data[0]
        current_result = parent_task.get('result') or {}
        is_cancelled = current_result.get('is_cancelled', False)

        res = supabase_client.table('task_runs').select('status').eq('state->>task_id', task_id).execute()
        if res.data:
            succeeded = sum(1 for r in res.data if r.get('status') == 'completed')
            failed    = sum(1 for r in res.data if r.get('status') == 'failed')
            total     = len(res.data)
            all_done  = all(r.get('status') in ['completed', 'failed'] for r in res.data)

            if is_cancelled:
                final_status = 'failed'
                logger.info(f"[Task {task_id}] Task is cancelled. Maintaining 'failed' status. Progress: {succeeded}/{total} completed, {failed} failed.")
            elif all_done:
                if succeeded == 0:
                    final_status = 'failed'
                else:
                    final_status = 'completed'
                logger.info(
                    f"[Task {task_id}] All {total} runs done. "
                    f"succeeded={succeeded}, failed={failed}. "
                    f"Setting parent task status → '{final_status}'"
                )
            else:
                final_status = 'running'
                logger.info(
                    f"[Task {task_id}] Progress update: {succeeded}/{total} completed, {failed} failed. "
                    f"Setting parent task status → 'running'"
                )

            result_obj = dict(current_result)
            result_obj['summary'] = {
                'total':     total,
                'succeeded': succeeded,
                'failed':    failed,
            }

            global NEXT_JOB_ALLOWED_TIME_GLOBAL
            if not all_done and not is_cancelled and NEXT_JOB_ALLOWED_TIME_GLOBAL > 0:
                from datetime import datetime, timezone
                result_obj['next_job_at'] = datetime.fromtimestamp(NEXT_JOB_ALLOWED_TIME_GLOBAL, tz=timezone.utc).isoformat()

            supabase_client.table('tasks').update({
                'status': final_status,
                'result': result_obj
            }).eq('id', task_id).execute()
    except Exception as e:
        logger.error(f"Failed to update parent task completion for {task_id}: {e}")

# ─── Redis ────────────────────────────────────────────────────────────────────
def get_redis_client():
    if not REDIS_URL:
        raise RuntimeError("REDIS_URL is not set in .env")
    return redis.from_url(REDIS_URL, decode_responses=True)

def pop_job(r: redis.Redis, timeout: int = 5):
    val = r.rpop(QUEUE_NAME)
    if val:
        return json.loads(val)
    return None

def push_test_job(r: redis.Redis, site_url: str, client_site: str, keyword: str):
    job = {
        "id": f"test-{int(time.time())}",
        "state": {
            "target_site": site_url,
            "client_target_url": client_site,
            "keyword": keyword,
            "task_id": "test-parent-task",
        },
        "site_id": "pligg_generic",
        "client_id": "test-client",
        "target_site_id": "test-target-site"
    }
    r.lpush(QUEUE_NAME, json.dumps(job))
    logger.info("Pushed test job %s → %s", job["id"], QUEUE_NAME)
    return job

# ─── Browser ──────────────────────────────────────────────────────────────────
def create_driver(worker_id: int):
    # Ensure profile directory exists so cookies/sessions are reused
    profile_path = os.path.join(os.getenv("BOOKMARKBOT_BASE_DIR", "C:\\BookmarkBot"), "profiles", f"worker_{worker_id}")
    os.makedirs(profile_path, exist_ok=True)
    
    driver = Driver(
        browser="chrome",
        headless=False,
        uc=True,
        window_size=f"{WINDOW_WIDTH},{WINDOW_HEIGHT}",
        user_data_dir=profile_path,
    )
    driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    return driver

# ─── Worker thread ────────────────────────────────────────────────────────────
def run_job(job: dict, worker_id: int):
    wlog = logging.getLogger(f"W{worker_id:02d}")
    
    # Extract metadata
    task_run_id    = job.get("id", "?")
    state          = job.get("state", {})
    target_url     = state.get("target_site", "")
    client_site    = state.get("client_target_url", "")
    keyword        = state.get("keyword", "test keyword")
    client_id      = job.get("client_id")
    target_site_id = job.get("target_site_id")
    template_type  = job.get("site_id", "pligg_generic")

    wlog.info("Starting job %s → site=%s keyword='%s'", task_run_id, target_url, keyword)

    # Initialize FailureHandler
    failure_handler = FailureHandler(supabase, wlog)

    # Pre-Execution Logging
    try:
        mark_parent_task_running(supabase, state.get("task_id"))
        supabase.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': 0,
            'role': 'system',
            'message': f"Initializing Browser Session for {target_url}",
            'metadata': {'step_name': 'Initialization', 'status': 'running'}
        }).execute()
    except Exception as e:
        wlog.error("Failed pre-execution DB update: %s", e)

    driver = create_driver(worker_id)
    try:
        time.sleep(random.uniform(0, 2))

        pligg = PliggTemplate(driver, wlog)
        backlink = pligg.run(
            target_site=target_url,
            client_site=client_site,
            keyword=keyword,
        )
        
        wlog.info("✅ Job %s DONE — backlink: %s", task_run_id, backlink)
        
        # Post-Execution Database Updates (Success)
        try:
            supabase.table('task_run_logs').insert({
                'task_run_id': task_run_id,
                'step_index': 1,
                'role': 'assistant',
                'message': f"Success. Live URL: {backlink}",
                'metadata': {'step_name': 'Execution', 'status': 'completed', 'structured_data': {'live_url': backlink, 'status': 'success'}}
            }).execute()

            supabase.table('backlinks').insert({
                'client_id': client_id,
                'source_url': target_url,
                'target_url': client_site,
                'result_url': backlink,
                'status': 'verified',
                'metadata': {'live_url': backlink, 'status': 'success'}
            }).execute()

            supabase.table('task_runs').update({'status': 'completed', 'current_step_index': 1}).eq('id', task_run_id).execute()
            
            failure_handler.handle_success(target_site_id)
        except Exception as e:
            wlog.error("Failed post-execution DB update: %s", e)

        return {"id": task_run_id, "status": "completed", "backlink": backlink}

    except Exception as e:
        wlog.error("❌ Job %s FAILED: %s", task_run_id, e, exc_info=True)
        
        # Post-Execution Database Updates (Failure)
        failure_handler.handle_failure(
            task_run_id=task_run_id,
            target_site_id=target_site_id,
            template_type=template_type,
            error=e,
            driver=driver,
            step="execution"
        )
        try:
            supabase.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
        except Exception as inner_e:
            wlog.error("Failed to update task_runs status: %s", inner_e)
            
        return {"id": task_run_id, "status": "failed", "error": str(e)}

    finally:
        try:
            driver.quit()
        except Exception:
            pass
        # Regardless of outcome, check and update parent task
        check_and_update_parent_task(supabase, state)

# ─── Main polling loop ────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Local BookmarkBot worker")
    parser.add_argument("--push-test-job", action="store_true",
                        help="Push a test job and exit")
    parser.add_argument("--site",        default="https://livebookmarking.com")
    parser.add_argument("--client-site", default="https://example-client.com")
    parser.add_argument("--keyword",     default="test keyword")
    args = parser.parse_args()

    r = get_redis_client()
    logger.info("Connected to Redis ✓")

    if args.push_test_job:
        push_test_job(r, args.site, args.client_site, args.keyword)
        logger.info("Done. Run without --push-test-job to start processing.")
        return

    logger.info("Polling '%s' with %d concurrent worker(s)…", QUEUE_NAME, MAX_WORKERS)
    results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {}
        worker_counter = 0

        while True:
            # Clean up finished futures
            done = [f for f in list(futures) if f.done()]
            for f in done:
                results.append(f.result())
                del futures[f]

            available = MAX_WORKERS - len(futures)
            for _ in range(available):
                job = pop_job(r)
                if not job:
                    break
                worker_counter += 1
                wid = worker_counter % MAX_WORKERS
                fut = pool.submit(run_job, job, wid)
                futures[fut] = job["id"]
                logger.info("Dispatched job %s to worker slot %d", job["id"], wid)

            if not futures:
                # Nothing running, nothing in queue → wait
                time.sleep(2)

if __name__ == "__main__":
    main()
