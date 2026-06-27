"""
local_worker.py — True successor to vps_worker_playwright.py.

Flow per job:
  ① Stagger sleep          (prevent all threads stampeding CF at once)
  ② Rate limit             (global + per-host pacing)
  ③ Pre-log to Supabase    (mark parent task running)
  ④ nodriver CF harvest    (get cf_clearance cookie)
  ⑤ SB UC navigate + CF   (uc_open_with_reconnect → uc_gui_click_captcha)
  ⑥ Inject CF cookies      (nodriver cookies into SB session)
  ⑦ CDP handover           (driver._get_cdp_details → ws URL → Playwright)
  ⑧ PlaywrightPliggTemplate (register + submit — fully async Playwright)
  ⑨ Post-log Supabase      (backlinks + task_runs + task_run_logs)

Concurrency model:  ThreadPoolExecutor(MAX_CONCURRENT_SESSIONS)
                    Each thread owns one persistent Driver instance.

.env controls (config.py):
    MAX_CONCURRENT_SESSIONS   parallel browser threads      (default 4)
    POLL_INTERVAL_SECONDS     empty-queue sleep seconds     (default 10)
    STARTUP_STAGGER_MAX       max pre-job random sleep      (default 3.0)
    BROWSER_RESTART_EVERY     restart driver every N jobs   (default 150)
    JOB_COOLDOWN              sleep between jobs per thread (default 1.5)
    REDIS_URL                 Redis connection string
    PAGE_LOAD_TIMEOUT         browser page-load timeout     (default 60)
    WINDOW_WIDTH / HEIGHT     browser window size
    HEADLESS                  headless Chrome               (default false)
    USE_PLAYWRIGHT_HANDOVER   false = stay with pure SB     (default true)
"""

import asyncio
import json
import logging
import os
import random
import time
import threading
import queue
from argparse import ArgumentParser

import redis
from dotenv import load_dotenv
from seleniumbase import Driver
from supabase import create_client, Client
from cdp_bezier_mouse import move_mouse_humanlike_cdp, click_cdp

from config import (
    BROWSER_RESTART_EVERY,
    HEADLESS,
    JOB_COOLDOWN,
    MAX_CONCURRENT_SESSIONS,
    MAX_RETRIES,
    PAGE_LOAD_TIMEOUT,
    POLL_INTERVAL_SECONDS,
    PROFILE_BASE_DIR,
    REDIS_URL,
    STARTUP_STAGGER_MAX,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)
from db import recover_stale_running_jobs
from failure_handler import FailureHandler
from logger_setup import get_logger
from metrics import metrics
from pligg_template import PliggTemplate
from rate_limiter import rate_limiter

load_dotenv()

# ─── Config flags ─────────────────────────────────────────────────────────────
# Playwright handover and complex CF tiers removed in favor of native SeleniumBase.
USE_PLAYWRIGHT_HANDOVER = False

# ─── Supabase (shared read-only across threads — REST calls are thread-safe) ──
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

QUEUE_NAME = "backlink_queue"

logger = get_logger("Worker")

# ─── Supabase helpers (identical to vps_worker_playwright.py) ─────────────────

def mark_parent_task_running(task_id: str) -> None:
    if not task_id:
        return
    try:
        supabase.table("tasks") \
            .update({"status": "running"}) \
            .eq("id", task_id) \
            .eq("status", "pending") \
            .execute()
    except Exception as e:
        logger.error("[Task %s] mark_running failed: %s", task_id, e)


def check_and_update_parent_task(state: dict) -> None:
    """
    Checks if all task_runs for a parent task are done and updates parent status.
    Mirrors vps_worker_playwright.check_and_update_parent_task exactly.
    """
    task_id = state.get("task_id")
    if not task_id:
        return
    try:
        parent_res = supabase.table("tasks").select("status, result").eq("id", task_id).execute()
        if not parent_res.data:
            return

        current_result = parent_res.data[0].get("result") or {}
        is_cancelled   = current_result.get("is_cancelled", False)

        res = supabase.table("task_runs").select("status").eq("state->>task_id", task_id).execute()
        if not res.data:
            return

        succeeded = sum(1 for r in res.data if r.get("status") == "completed")
        failed    = sum(1 for r in res.data if r.get("status") == "failed")
        total     = len(res.data)
        all_done  = all(r.get("status") in ("completed", "failed") for r in res.data)

        if is_cancelled:
            final_status = "failed"
            logger.info("[Task %s] Cancelled. %s/%s done, %s failed.", task_id, succeeded, total, failed)
        elif all_done:
            final_status = "completed" if succeeded > 0 else "failed"
            logger.info("[Task %s] All %s runs → '%s'", task_id, total, final_status)
        else:
            final_status = "running"
            logger.info("[Task %s] Progress %s/%s, %s failed.", task_id, succeeded, total, failed)

        result_obj = dict(current_result)
        result_obj["summary"] = {"total": total, "succeeded": succeeded, "failed": failed}

        supabase.table("tasks").update({
            "status": final_status,
            "result": result_obj,
        }).eq("id", task_id).execute()

    except Exception as e:
        logger.error("check_and_update_parent_task failed for %s: %s", task_id, e)


# ─── Redis ────────────────────────────────────────────────────────────────────

def get_redis() -> redis.Redis:
    if not REDIS_URL:
        raise RuntimeError("REDIS_URL is not set in .env")
    return redis.from_url(
        REDIS_URL, 
        decode_responses=True,
        socket_timeout=30,
        socket_connect_timeout=30,
        socket_keepalive=True,
        health_check_interval=30
    )


def pop_job(r: redis.Redis):
    val = r.rpop(QUEUE_NAME)
    return json.loads(val) if val else None


def push_test_job(r: redis.Redis, site_url: str, client_site: str, keyword: str) -> dict:
    job = {
        "id": f"test-{int(time.time())}",
        "state": {
            "target_site":      site_url,
            "client_target_url": client_site,
            "keyword":          keyword,
            "task_id":          "test-parent-task",
        },
        "site_id":       "pligg_generic",
        "client_id":     "test-client",
        "target_site_id": "test-target-site",
    }
    r.lpush(QUEUE_NAME, json.dumps(job))
    logger.info("Pushed test job %s → %s", job["id"], QUEUE_NAME)
    return job


# ─── Fingerprint Data ─────────────────────────────────────────────────────────
VIEWPORTS = [
    (1920, 1080),
    (1366, 768),
    (1536, 864),
    (1440, 900),
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

# ─── Browser ──────────────────────────────────────────────────────────────────

def create_driver(worker_id: int) -> Driver:
    """
    Create a SeleniumBase UC Mode driver with persistent per-worker Chrome profile.

    UC Mode (uc=True) automatically activates CDP mode on navigate (SB ≥ 4.x).
    Persistent user_data_dir means CF cookies, site sessions, and login state
    survive between driver restarts.
    """
    profile_path = PROFILE_BASE_DIR / f"worker_{worker_id}"
    os.makedirs(profile_path, exist_ok=True)

    viewport = random.choice(VIEWPORTS)
    ua = random.choice(USER_AGENTS)

    driver = Driver(
        browser="chrome",
        headless=HEADLESS,
        uc=True,
        window_size=f"{viewport[0]},{viewport[1]}",
        user_data_dir=str(profile_path),
        agent=ua,
    )
    
    # Inject WebGL & Canvas Fingerprint Spoofing via CDP
    try:
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) return "Intel Inc.";
                    if (parameter === 37446) return "Intel Iris OpenGL Engine";
                    return getParameter(parameter);
                };
                const toDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function(type) {
                    if (type === 'image/png' && this.width > 16 && this.height > 16) {
                        const ctx = this.getContext('2d');
                        if (ctx) {
                            const imageData = ctx.getImageData(0, 0, this.width, this.height);
                            const data = imageData.data;
                            const idx = Math.floor(Math.random() * data.length / 4) * 4 + 3;
                            data[idx] = (data[idx] + 1) % 256;
                            ctx.putImageData(imageData, 0, 0);
                        }
                    }
                    return toDataURL.apply(this, arguments);
                };
            """
        })
    except Exception as e:
        logger.warning("Failed to inject WebGL/Canvas spoof script: %s", e)

    try:
        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    except Exception:
        pass
    return driver


def get_cdp_ws_url(driver: Driver) -> str | None:
    """
    Extract the Chrome CDP WebSocket URL from a running SeleniumBase Driver.

    Uses driver._get_cdp_details() which reads /json/version from Chrome's
    built-in debugger endpoint. Returns None if unavailable (falls back to SB).
    """
    try:
        _version, ws_url = driver._get_cdp_details()
        logger.debug("CDP WebSocket URL: %s", ws_url)
        return ws_url
    except Exception as e:
        logger.warning("Could not get CDP WS URL (will use SB fallback): %s", e)
        return None


# ─── Job Execution ────────────────────────────────────────────────────────────

def run_job(job: dict, worker_id: int, driver: Driver, wlog: logging.Logger) -> dict:
    """
    Execute a single bookmarking job.

    Uses USE_PLAYWRIGHT_HANDOVER (default true):
      True  → SB clears CF, then Playwright does registration via CDP handover
      False → SB does everything (debug/fallback mode)
    """
    task_run_id    = job.get("id", "?")
    state          = job.get("state", {})
    target_url     = state.get("target_site", "")
    client_site    = state.get("client_target_url", "")
    keyword        = state.get("keyword", "test keyword")
    client_id      = job.get("client_id")
    target_site_id = job.get("target_site_id")
    template_type  = job.get("site_id", "pligg_generic")

    wlog.info("Job %s → %s keyword='%s'",
              task_run_id, target_url, keyword)

    failure_handler = FailureHandler(supabase, wlog)

    # ── ① Startup stagger ─────────────────────────────────────────────────────
    stagger = random.uniform(0, STARTUP_STAGGER_MAX)
    wlog.debug("Stagger %.2fs", stagger)
    time.sleep(stagger)

    # ── ② Rate limit ──────────────────────────────────────────────────────────
    rate_limiter.wait_for_turn(target_url)
    metrics.inc("jobs_started")

    # ── ③ Pre-log ─────────────────────────────────────────────────────────────
    try:
        mark_parent_task_running(state.get("task_id"))
        supabase.table("task_run_logs").insert({
            "task_run_id": task_run_id,
            "step_index":  0,
            "role":        "system",
            "message":     f"Browser session initializing for {target_url}",
            "metadata":    {"step_name": "Initialization", "status": "running"},
        }).execute()
    except Exception as e:
        wlog.error("Pre-log failed (non-fatal): %s", e)

    try:
        # ponytail: skipped complex CF harvest & Playwright handover tiers
        wlog.info("Executing directly via SeleniumBase template...")
        backlink = PliggTemplate(driver, wlog).run(
            target_site=target_url,
            client_site=client_site,
            keyword=keyword,
        )

        wlog.info("✅ Job %s DONE — %s", task_run_id, backlink)
        metrics.inc("jobs_succeeded")

        # ── ⑨ Post-log success ────────────────────────────────────────────────
        try:
            supabase.table("task_run_logs").insert({
                "task_run_id": task_run_id,
                "step_index":  1,
                "role":        "assistant",
                "message":     f"Success. Live URL: {backlink}",
                "metadata":    {
                    "step_name": "Execution",
                    "status":    "completed",
                    "structured_data": {"live_url": backlink, "status": "success"},
                },
            }).execute()

            supabase.table("backlinks").insert({
                "client_id":  client_id,
                "source_url": target_url,
                "target_url": client_site,
                "result_url": backlink,
                "status":     "verified",
                "metadata":   {"live_url": backlink, "status": "success"},
            }).execute()

            supabase.table("task_runs").update({
                "status":              "completed",
                "current_step_index":  1,
            }).eq("id", task_run_id).execute()

            failure_handler.handle_success(target_site_id)

        except Exception as e:
            wlog.error("Post-success DB update failed: %s", e)

        return {"id": task_run_id, "status": "completed", "backlink": backlink}

    except Exception as e:
        wlog.error("❌ Job %s FAILED: %s", task_run_id, e, exc_info=True)
        metrics.inc("jobs_failed")

        failure_handler.handle_failure(
            task_run_id=task_run_id,
            target_site_id=target_site_id,
            template_type=template_type,
            error=e,
            driver=driver,
            step="execution",
        )
        try:
            supabase.table("task_runs").update({"status": "failed"}).eq("id", task_run_id).execute()
        except Exception as ie:
            wlog.error("task_runs status update failed: %s", ie)

        return {"id": task_run_id, "status": "failed", "error": str(e)}

    finally:
        check_and_update_parent_task(state)


# ─── Worker Thread ────────────────────────────────────────────────────────────

class Worker(threading.Thread):
    def __init__(self, worker_id: int):
        super().__init__()
        self.worker_id = worker_id
        self.job_queue = queue.Queue()
        self.driver = None
        self.job_count = 0
        self.wlog = get_logger(f"W{worker_id:02d}")
        self.idle_timeout = 60.0
        self.daemon = True

    def run(self):
        self.wlog.info("Worker thread starting.")
        try:
            while True:
                try:
                    job = self.job_queue.get(timeout=self.idle_timeout)
                    if job is None:
                        self.wlog.info("Received shutdown signal.")
                        break

                    if self.driver is None:
                        self.wlog.info("Spinning up browser for new job...")
                        self.driver = create_driver(self.worker_id)

                    if self.job_count > 0 and self.job_count % BROWSER_RESTART_EVERY == 0:
                        self.wlog.info("Restarting browser at job #%d", self.job_count)
                        try:
                            self.driver.quit()
                        except Exception:
                            pass
                        time.sleep(2)
                        self.driver = create_driver(self.worker_id)

                    try:
                        run_job(job, self.worker_id, self.driver, self.wlog)
                        self.job_count += 1
                        time.sleep(JOB_COOLDOWN)
                    except Exception as e:
                        self.wlog.error("Job crashed unexpectedly: %s", e, exc_info=True)
                        if self.driver:
                            try:
                                self.driver.quit()
                            except Exception:
                                pass
                            self.driver = None
                    finally:
                        self.job_queue.task_done()

                except queue.Empty:
                    self.wlog.info("Idle timeout (%.1fs) reached. Shutting down browser to free RAM.", self.idle_timeout)
                    break

        except Exception as e:
            self.wlog.error("Thread crashed: %s", e, exc_info=True)
        finally:
            if self.driver:
                try:
                    self.driver.quit()
                except Exception:
                    pass
            self.wlog.info("Worker thread done. Processed %d jobs.", self.job_count)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = ArgumentParser(description="BookmarkBot — Redis worker (playwright_worker successor)")
    ap.add_argument("--push-test-job", action="store_true",
                    help="Push one test job to Redis and exit")
    ap.add_argument("--site",        default="https://livebookmarking.com")
    ap.add_argument("--client-site", default="https://example-client.com")
    ap.add_argument("--keyword",     default="test keyword")
    args = ap.parse_args()

    r = get_redis()
    logger.info("Redis connected ✓")

    if args.push_test_job:
        push_test_job(r, args.site, args.client_site, args.keyword)
        logger.info("Test job pushed. Run without --push-test-job to start workers.")
        return

    # Recover stale jobs from crashed previous sessions
    try:
        n = recover_stale_running_jobs(stale_after_minutes=60)
        if n:
            logger.info("Recovered %d stale job(s) → pending", n)
    except Exception as e:
        logger.warning("Stale recovery failed (non-fatal): %s", e)

    logger.info(
        "Starting Dynamic Dispatcher | max_concurrency=%d | cooldown=%.1fs | "
        "restart_every=%d | playwright_handover=%s",
        MAX_CONCURRENT_SESSIONS, JOB_COOLDOWN,
        BROWSER_RESTART_EVERY, USE_PLAYWRIGHT_HANDOVER,
    )

    workers = {}  # worker_id -> Worker thread
    worker_id_counter = 0

    try:
        while True:
            try:
                # Clean up dead workers
                dead_workers = [wid for wid, w in workers.items() if not w.is_alive()]
                for wid in dead_workers:
                    del workers[wid]

                job = pop_job(r)
                if job is None:
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue

                dispatched = False
                
                # 1. Look for an existing idle worker
                for wid, w in workers.items():
                    if w.job_queue.empty():
                        w.job_queue.put(job)
                        dispatched = True
                        break

                # 2. If no idle worker, spawn a new one (if under limit)
                if not dispatched and len(workers) < MAX_CONCURRENT_SESSIONS:
                    worker_id = (worker_id_counter % MAX_CONCURRENT_SESSIONS) + 1
                    worker_id_counter += 1
                    w = Worker(worker_id)
                    w.start()
                    workers[worker_id] = w
                    w.job_queue.put(job)
                    dispatched = True

                # 3. If at concurrency limit, push job back and wait
                if not dispatched:
                    r.rpush(QUEUE_NAME, json.dumps(job))
                    time.sleep(1.0)
                    
            except Exception as e:
                logger.error("Network or internal error in dispatcher loop: %s", e)
                logger.info("Attempting to reconnect to Redis and recover in 5s...")
                time.sleep(5)
                try:
                    r = get_redis()
                except Exception:
                    pass

                
    except KeyboardInterrupt:
        logger.info("Dispatcher received KeyboardInterrupt, shutting down...")
    finally:
        logger.info("Shutting down all workers gracefully...")
        for w in workers.values():
            if w.is_alive():
                w.job_queue.put(None)  # Poison pill
        for w in workers.values():
            if w.is_alive():
                w.join(timeout=10)
        logger.info("All workers done. Final: %s", metrics.snapshot())


if __name__ == "__main__":
    main()
