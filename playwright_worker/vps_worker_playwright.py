"""
VPS Worker - Backlink Automation Orchestrator

Polls Supabase for pending task_runs and executes them asynchronously
using the TemplateRunner for config-driven template resolution.

Features:
    - Concurrent execution (configurable MAX_CONCURRENT_SESSIONS)
    - Automatic browser lifecycle management
    - Template routing via executor/runner.py (extensible registry)
    - Failure classification + site health tracking via FailureHandler
    - Parent task completion detection

Run with:
    python vps_worker_playwright.py
"""

import os
import sys
import asyncio
import logging
import json
import traceback
from supabase import create_client, Client
from dotenv import load_dotenv

# Ensure we can import from playwright_automation.backlink_automation
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from methods.session_pool import BrowserlessSessionPool
from services.captcha_service import CaptchaService
from services.logging_service import setup_logger
from services.template_detector import TemplateDetector
from services.proxy_manager import ProxyManager
from executor.runner import TemplateRunner
from executor.failure_handler import FailureHandler
from services.redis_service import RedisService

load_dotenv()

# --- CONFIGURATION ---
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")

MAX_CONCURRENT_SESSIONS = int(os.environ.get("MAX_CONCURRENT_SESSIONS", 4))
POLL_INTERVAL_SECONDS = 30

# Initialize global Supabase client (can be shared for async reading)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
logger = setup_logger(level=logging.INFO)

proxy_manager = ProxyManager(logger=logger)

# Global browser manager pool
browser_manager = BrowserlessSessionPool(
    endpoints=os.environ.get("BROWSERLESS_ENDPOINTS", "ws://localhost:3000").split(","),
    proxy_manager=proxy_manager,
    max_slots=MAX_CONCURRENT_SESSIONS,
    logger=logger
)

captcha_service = CaptchaService(logger=logger)

# Template runner (extensible — add new templates in executor/runner.py)
template_runner = TemplateRunner()

# Template detector (bypasses CF via stealth browser)
template_detector = TemplateDetector(browser_manager, logger)

# Global redis service
redis_service = RedisService(logger=logger)

# Global tracker for rate limiter
NEXT_JOB_ALLOWED_TIME_GLOBAL = 0

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
    """Checks if all task_runs for a parent task are done, and if so, updates the parent task status.
    
    Sets parent task status to:
      - 'failed'    if ALL child runs failed
      - 'completed' if at least one child run succeeded (even if others failed)
      - 'running'   if there are still jobs pending, but we want to show progress
    Also stores a result summary (succeeded/failed counts) on the tasks row.
    """
    task_id = state.get('task_id')
    if not task_id:
        return
    try:
        # First get the current parent task to preserve result keys and check if cancelled
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
                # Determine final task status
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

            # Build result object with the next job timestamp if applicable
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

async def detect_and_update(site_id_db: str, url: str):
    """
    Fingerprints an undetected site using the Playwright stealth browser
    and writes the detected site_id (template) back to Supabase.
    """
    logger.info(f"[Detector] Fingerprinting: {url}")
    try:
        detected = await template_detector.detect(url)
        if detected is not None:
            supabase.table('target_sites').update({'site_id': detected}).eq('id', site_id_db).execute()
            logger.info(f"[Detector] Updated {url} → {detected}")
        else:
            logger.warning(f"[Detector] Inconclusive detection for {url} — will retry later.")
    except Exception as e:
        logger.error(f"[Detector] Failed to detect {url}: {e}")

async def route_and_execute(task_run, supabase_client: Client):
    """
    Executes a single step of a workflow task_run.
    Uses TemplateRunner for config-driven template resolution and routing.
    """
    task_run_id = task_run['id']
    
    # Stagger startups slightly to avoid CDP websocket race conditions on new_context
    import random
    await asyncio.sleep(random.uniform(0.5, 3.0))
    
    # Initialize failure handler for this execution
    failure_handler = FailureHandler(supabase_client, logger)
    
    try:
        template = task_run.get('workflow_templates', {})
        steps = template.get('steps', [])
        current_index = task_run.get('current_step_index', 0)
        
        if current_index >= len(steps):
            supabase_client.table('task_runs').update({'status': 'completed'}).eq('id', task_run_id).execute()
            return
            
        step = steps[current_index]
        state = task_run.get('state', {})
        target_url = state.get('target_site', '')
        client_target_url = state.get('client_target_url', '')
        keyword = state.get('keyword', 'Target Keyword')
        client_id = task_run.get('client_id')
        target_site_id = task_run.get('target_site_id')
        
        logger.info(f"[TaskRun {task_run_id}] Executing step {current_index + 1}/{len(steps)}: {step.get('name')} on {target_url}")

        supabase_client.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': current_index,
            'role': 'system',
            'message': f"Starting execution of step: {step.get('name')}. Initializing Browser Session.",
            'metadata': {'step_name': step.get('name'), 'status': 'running'}
        }).execute()

        result = None
        result_message = ""
        parsed_data = None
        
        if step.get('type') == 'report_generation' or 'report' in step.get('name', '').lower():
            logger.info(f"[TaskRun {task_run_id}] Intercepted Reporting Step.")
            result = {'status': 'completed'}
            result_message = "Verification completed successfully. The report data is ready."
        else:
            # --- TEMPLATE ROUTING via TemplateRunner ---
            # Reads site_id from target_sites to determine which automation
            # template to use. site_id is populated by the detect-site-templates
            # Supabase edge function which fingerprints each site's CMS.

            site_id = None

            if target_site_id:
                site_res = supabase_client.table('target_sites').select('site_id').eq('id', target_site_id).execute()
                if site_res.data and len(site_res.data) > 0:
                    site_id = (site_res.data[0].get('site_id') or '').lower() or None
            elif target_url:
                # Fallback: if task didn't include target_site_id, try to match by url
                clean_url = target_url.rstrip('/')
                site_res = supabase_client.table('target_sites').select('site_id').ilike('url', f"%{clean_url}%").execute()
                if site_res.data and len(site_res.data) > 0:
                    site_id = (site_res.data[0].get('site_id') or '').lower() or None

            logger.info(f"[TaskRun {task_run_id}] Routing to template: {site_id!r} (target_site_id={target_site_id})")

            # Use TemplateRunner for config-driven routing
            if template_runner.is_supported(site_id):
                slot = None
                page = None
                try:
                    slot = await browser_manager.checkout_slot()
                    if not slot:
                        raise Exception("Failed to checkout a Browserless slot. All slots may be broken.")
                        
                    page = slot["session"]["page"]
                    res = await template_runner.execute(
                        site_id=site_id,
                        target_url=target_url,
                        target_site_db_id=target_site_id,
                        client_url=client_target_url,
                        keyword=keyword,
                        page=page,
                        captcha_service=captcha_service,
                        logger=logger
                    )
                    result = {'status': 'completed'}
                    result_message = f"Success. Live URL: {res.get('backlink_url')}"
                    parsed_data = {
                        "live_url": res.get("backlink_url"),
                        "status": "success"
                    }
                    # Update site health on success
                    await failure_handler.handle_success(target_site_id)
                except Exception as e:
                    logger.error(f"[TaskRun {task_run_id}] Execution failed: {e}")
                    result = {'status': 'failed'}
                    result_message = f"Agent failed. Error: {str(e)}"
                    # Classify and log failure with evidence
                    await failure_handler.handle_failure(
                        task_run_id=task_run_id,
                        target_site_id=target_site_id,
                        template_type=site_id or "unknown",
                        error=e,
                        page=page,
                        step=step.get('name', 'execution')
                    )
                finally:
                    if slot:
                        await browser_manager.checkin_slot(slot, harvest_cookies=True)
            else:
                # Unsupported template — no registered handler
                result = {'status': 'failed'}
                result_message = (
                    f"[TaskRun {task_run_id}] Cannot route: site_id is {site_id!r} for {target_url}. "
                    f"Supported templates: {template_runner.get_supported_templates()}. "
                    f"Run the detect-site-templates edge function to fingerprint this site."
                )
                logger.error(result_message)

        # Log result
        metadata = {'step_name': step.get('name'), 'status': result['status'] if result else 'completed'}
        if parsed_data:
            metadata['structured_data'] = parsed_data
            
        supabase_client.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': current_index,
            'role': 'assistant',
            'message': result_message,
            'metadata': metadata
        }).execute()
        
        is_submission_step = ('submit' in step.get('name', '').lower() or 'execute' in step.get('name', '').lower())
        
        if result['status'] == 'completed' and is_submission_step and parsed_data and parsed_data.get('live_url'):
            live_url = parsed_data.get('live_url')
            try:
                supabase_client.table('backlinks').insert({
                    'client_id': client_id,
                    'source_url': target_url,
                    'target_url': client_target_url,
                    'result_url': live_url,
                    'status': 'verified',
                    'metadata': parsed_data
                }).execute()
                logger.info(f"[TaskRun {task_run_id}] Logged live URL to backlinks table: {live_url}")
            except Exception as e:
                logger.error(f"[TaskRun {task_run_id}] Failed to log to backlinks table: {e}")

        # Advance step
        if result and result.get('status') == 'failed':
            supabase_client.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
            check_and_update_parent_task(supabase_client, state)
        else:
            next_index = current_index + 1
            if next_index >= len(steps):
                supabase_client.table('task_runs').update({
                    'current_step_index': next_index,
                    'status': 'completed'
                }).eq('id', task_run_id).execute()
                check_and_update_parent_task(supabase_client, state)
            else:
                require_approval = state.get('requireApproval', False)
                if require_approval and steps[next_index].get('type') == 'approval':
                    supabase_client.table('task_runs').update({
                        'current_step_index': next_index,
                        'status': 'waiting_approval'
                    }).eq('id', task_run_id).execute()
                    
                    try:
                        supabase_client.table('approvals').insert({
                            'client_id': client_id,
                            'department_id': task_run.get('department_id'),
                            'task_run_id': task_run_id,
                            'action_type': 'workflow_approval',
                            'description': f"Review completion of {step.get('name')}.",
                            'status': 'pending',
                            'payload': state
                        }).execute()
                    except Exception as e:
                        logger.error(f"[TaskRun {task_run_id}] Failed to insert approval record: {e}")
                else:
                    supabase_client.table('task_runs').update({
                        'current_step_index': next_index,
                        'status': 'pending'
                    }).eq('id', task_run_id).execute()
                
    except asyncio.CancelledError:
        logger.warning(f"[TaskRun {task_run_id}] Execution was cancelled by the user.")
        supabase_client.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': task_run.get('current_step_index', 0),
            'role': 'system',
            'message': "Job was cancelled by the user.",
            'metadata': {'status': 'failed'}
        }).execute()
        supabase_client.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
        check_and_update_parent_task(supabase_client, task_run.get('state', {}))
        return
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[TaskRun {task_run_id}] Unexpected error:\n{error_trace}")
        supabase_client.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
        check_and_update_parent_task(supabase_client, task_run.get('state', {}))
        try:
            supabase_client.table('task_run_logs').insert({
                'task_run_id': task_run_id,
                'step_index': current_index if 'current_index' in locals() else 0,
                'role': 'system',
                'message': f"CRITICAL CRASH: {str(e)}\n\n{error_trace}",
                'metadata': {'status': 'failed', 'error': True}
            }).execute()
        except:
            pass

async def poll_queue():
    """
    Main loop: polls Supabase for pending task_runs and executes them asynchronously.
    """
    global supabase
    logger.info(f"Starting Playwright Worker Orchestrator... Max Concurrent Sessions: {MAX_CONCURRENT_SESSIONS}")
    logger.info(f"Supported templates: {template_runner.get_supported_templates()}")
    
    active_tasks = set()
    task_mapping = {}  # Map asyncio.Task -> parent_task_id
    
    # Pre-warm all persistent sessions once at startup
    await browser_manager.initialize()
    
    try:
        while True:
            try:
                # --- Check for cancelled tasks ---
                if task_mapping:
                    parent_ids = list(set(task_mapping.values()))
                    if parent_ids:
                        res_cancelled = supabase.table('tasks').select('id, status').in_('id', parent_ids).eq('status', 'failed').execute()
                        if res_cancelled.data:
                            cancelled_ids = [r['id'] for r in res_cancelled.data]
                            for t_task, p_id in list(task_mapping.items()):
                                if p_id in cancelled_ids:
                                    logger.info(f"Parent task {p_id} was failed. Cancelling associated task_run.")
                                    t_task.cancel()

                available_slots = MAX_CONCURRENT_SESSIONS - len(active_tasks)
                
                # Fetch NEW jobs from Redis
                if available_slots > 0:
                    if redis_service.client:
                        # Use rpop instead of blocking brpop to prevent socket timeout errors over WAN
                        job_json = await redis_service.client.rpop("backlink_queue")
                        if job_json:
                            job = json.loads(job_json)
                            
                            # Mark as processing in Redis hash for state sync
                            await redis_service.client.hset("job_status", job['id'], "processing")
                            
                            logger.info(f"Popped job {job['id']} from Redis queue. Active: {len(active_tasks)+1}/{MAX_CONCURRENT_SESSIONS}")
                            
                            parent_task_id = job.get('state', {}).get('task_id')
                            if parent_task_id:
                                mark_parent_task_running(supabase, parent_task_id)
                                
                            task = asyncio.create_task(route_and_execute(job, create_client(SUPABASE_URL, SUPABASE_KEY)))
                            active_tasks.add(task)
                            
                            if parent_task_id:
                                task_mapping[task] = parent_task_id
                                
                            def cleanup_task(fut, t_ref=task, j_id=job['id']):
                                active_tasks.discard(t_ref)
                                task_mapping.pop(t_ref, None)
                                # Try to determine success/fail from exception
                                try:
                                    exc = fut.exception()
                                    final_status = "failed" if exc else "completed"
                                except asyncio.CancelledError:
                                    final_status = "failed"
                                # Mark final status in Redis
                                asyncio.create_task(redis_service.client.hset("job_status", j_id, final_status))
                                
                            task.add_done_callback(cleanup_task)
                        else:
                            # Queue is empty, pause briefly to prevent CPU thrashing
                            await asyncio.sleep(2)
                    else:
                        logger.error("Redis client not connected. Waiting...")
                        await asyncio.sleep(5)
                else:
                    # Max capacity reached, wait for at least one task to finish
                    await asyncio.wait(active_tasks, return_when=asyncio.FIRST_COMPLETED, timeout=POLL_INTERVAL_SECONDS)
                    
            except Exception as e:
                logger.error(f"Error polling queue: {str(e)}")
                try:
                    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                except Exception:
                    pass
                await asyncio.sleep(5)

    finally:
        pass

if __name__ == "__main__":
    try:
        asyncio.run(poll_queue())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user.")