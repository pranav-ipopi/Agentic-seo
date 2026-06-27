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
from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor

import redis
from dotenv import load_dotenv
from playwright.async_api import async_playwright
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
from cf_session_manager import cf_bypass_manager
from db import recover_stale_running_jobs
from failure_handler import FailureHandler
from logger_setup import get_logger
from metrics import metrics
from playwright_pligg_template import PlaywrightPliggTemplate
from pligg_template import PliggTemplate           # fallback only
from rate_limiter import rate_limiter

load_dotenv()

# ─── Config flags ─────────────────────────────────────────────────────────────
USE_PLAYWRIGHT_HANDOVER = os.getenv("USE_PLAYWRIGHT_HANDOVER", "true").lower() in ("1", "true", "yes")

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
    return redis.from_url(REDIS_URL, decode_responses=True)


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

    wlog.info("Job %s → %s keyword='%s' [PW=%s]",
              task_run_id, target_url, keyword, USE_PLAYWRIGHT_HANDOVER)

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
        # ── ④ Harvest CF clearance via nodriver ───────────────────────────────
        wlog.info("Checking/harvesting CF session for %s", target_url)
        cookies = cf_bypass_manager.get_cf_clearance(target_url, worker_id)

        # ── ⑤ SB UC navigate + handle Turnstile ──────────────────────────────
        
        # Browser Warmup (Mimics Real User)
        wlog.info("Warming up browser on benign site...")
        try:
            driver.get("https://en.wikipedia.org/wiki/Main_Page")
            time.sleep(random.uniform(2.0, 3.5))
        except Exception:
            pass

        wlog.info("UC navigate → %s", target_url)
        driver.uc_open_with_reconnect(target_url, reconnect_time=3)

        # Handle CF Turnstile via Bezier CDP mouse movement
        try:
            iframe = driver.wait_for_element("iframe", timeout=4)
            src = iframe.get_attribute("src") or ""
            if "turnstile" in src or "challenge" in src:
                wlog.info("CF Challenge detected. Attempting Fitts's Law CDP click...")
                rect = driver.execute_script("return arguments[0].getBoundingClientRect();", iframe)
                if rect and rect['width'] > 10:
                    click_x = rect['x'] + 30 + random.randint(-5, 5)
                    click_y = rect['y'] + (rect['height'] / 2) + random.randint(-3, 3)
                    
                    move_mouse_humanlike_cdp(driver, click_x, click_y)
                    click_cdp(driver, click_x, click_y)
                    time.sleep(3)
        except Exception:
            pass  # not every page has CF; safe to ignore

        # ── ⑥ Inject pre-harvested CF cookies ────────────────────────────────
        if cookies:
            wlog.info("Injecting %d CF cookie(s)", len(cookies))
            for c in cookies:
                try:
                    driver.add_cookie({
                        "name":   c["name"],
                        "value":  c["value"],
                        "domain": c.get("domain", ""),
                    })
                except Exception:
                    pass
            driver.refresh()
            time.sleep(2)

        # ── ⑦ CDP handover to Playwright ──────────────────────────────────────
        if USE_PLAYWRIGHT_HANDOVER:
            cdp_ws = get_cdp_ws_url(driver)

            if cdp_ws:
                wlog.info("Handing off to Playwright via CDP → %s", cdp_ws)

                async def _run_playwright() -> str:
                    async with async_playwright() as pw:
                        browser = await pw.chromium.connect_over_cdp(cdp_ws)
                        # Get the tab that SB already navigated to
                        ctx  = browser.contexts[0] if browser.contexts else await browser.new_context()
                        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

                        template = PlaywrightPliggTemplate(page, wlog)
                        return await template.run(target_url, client_site, keyword)

                # Run async Playwright inside this sync thread
                backlink = asyncio.run(_run_playwright())
            else:
                # CDP endpoint unavailable — fall back to pure SB mode
                wlog.warning("CDP WS unavailable — falling back to SeleniumBase PliggTemplate")
                backlink = PliggTemplate(driver, wlog).run(
                    target_site=target_url,
                    client_site=client_site,
                    keyword=keyword,
                )
        else:
            # Explicit SB-only mode (USE_PLAYWRIGHT_HANDOVER=false in .env)
            wlog.info("SB-only mode (USE_PLAYWRIGHT_HANDOVER=false)")
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

def run_worker_thread(worker_id: int, r: redis.Redis) -> None:
    """
    Long-running thread. Owns one persistent Driver.

    Loop:
      - rpop from Redis
      - If empty → sleep POLL_INTERVAL_SECONDS → rpop again → exit if still empty
      - Restart driver every BROWSER_RESTART_EVERY jobs (memory leak prevention)
      - JOB_COOLDOWN sleep between jobs
    """
    wlog = get_logger(f"W{worker_id:02d}")
    wlog.info("Thread %02d starting", worker_id)

    driver = create_driver(worker_id)
    job_count = 0

    try:
        while True:
            job = pop_job(r)
            if job is None:
                wlog.debug("Queue empty — sleeping %ds", POLL_INTERVAL_SECONDS)
                time.sleep(POLL_INTERVAL_SECONDS)
                job = pop_job(r)
                if job is None:
                    wlog.info("Thread %02d: queue still empty — shutting down.", worker_id)
                    break

            # Browser restart (memory leak prevention)
            if job_count > 0 and job_count % BROWSER_RESTART_EVERY == 0:
                wlog.info("Thread %02d: restarting browser at job #%d", worker_id, job_count)
                try:
                    driver.quit()
                except Exception:
                    pass
                time.sleep(2)
                driver = create_driver(worker_id)

            run_job(job, worker_id, driver, wlog)
            job_count += 1
            time.sleep(JOB_COOLDOWN)

    except Exception as e:
        wlog.error("Thread %02d crashed: %s", worker_id, e, exc_info=True)
    finally:
        try:
            driver.quit()
        except Exception:
            pass
        wlog.info("Thread %02d done. Jobs: %d. Metrics: %s",
                  worker_id, job_count, metrics.snapshot())


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
        "Starting %d worker thread(s) | stagger=%.1fs | cooldown=%.1fs | "
        "restart_every=%d | playwright_handover=%s",
        MAX_CONCURRENT_SESSIONS, STARTUP_STAGGER_MAX, JOB_COOLDOWN,
        BROWSER_RESTART_EVERY, USE_PLAYWRIGHT_HANDOVER,
    )

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_SESSIONS) as pool:
        futures = [
            pool.submit(run_worker_thread, slot, r)
            for slot in range(MAX_CONCURRENT_SESSIONS)
        ]
        for fut in futures:
            try:
                fut.result()
            except Exception as e:
                logger.error("Worker thread error: %s", e)

    logger.info("All workers done. Final: %s", metrics.snapshot())


if __name__ == "__main__":
    main()
