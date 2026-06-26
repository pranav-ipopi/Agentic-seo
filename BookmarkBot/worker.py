from __future__ import annotations

import os
import queue
import time
from typing import Any
from urllib.parse import urlparse

from seleniumbase import Driver

from config import (
    ALLOWED_HOSTS,
    BROWSER_RESTART_EVERY,
    HEADLESS,
    JOB_COOLDOWN,
    MAX_RETRIES,
    PAGE_LOAD_TIMEOUT,
    PROFILE_BASE_DIR,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)
from db import increment_retry, mark_job_failed, mark_job_running, mark_job_success
from logger_setup import get_logger
from metrics import metrics
from proxy_manager import proxy_manager
from rate_limiter import rate_limiter

# Import our new modules
from cf_session_manager import cf_bypass_manager
from pligg_template import PliggTemplate


def _host_allowed(url: str) -> bool:
    if not ALLOWED_HOSTS:
        return True
    host = (urlparse(url).hostname or "").lower()
    return any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_HOSTS)


def create_driver(worker_id: int):
    """Create a browser driver for this worker using SeleniumBase UC mode."""
    profile_path = PROFILE_BASE_DIR / f"worker_{worker_id}"
    os.makedirs(profile_path, exist_ok=True)

    proxy = proxy_manager.get_proxy_for_worker(worker_id)

    driver_kwargs = {
        "browser": "chrome",
        "headless": HEADLESS, # User specifically requested headful local execution
        "user_data_dir": str(profile_path),
        "window_size": f"{WINDOW_WIDTH},{WINDOW_HEIGHT}",
        "uc": True, # UC Mode is essential for Cloudflare bypass
    }
    if proxy:
        driver_kwargs["proxy"] = proxy

    driver = Driver(**driver_kwargs)
    try:
        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    except Exception:
        pass
    return driver


def execute_job(driver, job: dict[str, Any], worker_id: int, logger) -> bool:
    """Run one authorized job. Handles Cloudflare bypass and Pligg flow."""
    url = (job.get("url") or "").strip()
    if not url:
        raise ValueError("Job is missing url")
    if not _host_allowed(url):
        raise PermissionError(f"Host not allowed for url: {url}")

    # Step 1: Rate limit check
    rate_limiter.wait_for_turn(url)
    metrics.inc("jobs_started")
    
    # Step 2: Harvest Cloudflare session using nodriver
    logger.info("Harvesting/Checking CF session for %s", url)
    cookies = cf_bypass_manager.get_cf_clearance(url, worker_id)
    
    # Step 3: Open target with UC Mode reconnect and inject cookies
    logger.info("Navigating to target using UC Mode")
    driver.uc_open_with_reconnect(url, reconnect_time=3)
    
    if cookies:
        logger.info("Injecting harvested cookies into SeleniumBase")
        for cookie in cookies:
            try:
                # SeleniumBase needs cookie dictionaries tailored for the current domain
                # We strip some attributes that might cause rejection
                clean_cookie = {
                    "name": cookie["name"],
                    "value": cookie["value"],
                    "domain": cookie["domain"]
                }
                driver.add_cookie(clean_cookie)
            except Exception as e:
                pass
        # Reload with injected cookies
        driver.refresh()
        time.sleep(2)

    # Step 4: Execute Job Action
    action = (job.get("action") or "visit").strip().lower()
    
    if action == "visit":
        return True
        
    elif action == "pligg_submit":
        client_site = job.get("client_site") or "https://example.com"
        keyword = job.get("keyword") or "Example Keyword"
        
        pligg = PliggTemplate(driver, logger)
        backlink = pligg.run(client_site, keyword)
        logger.info(f"Pligg submission completed! Backlink: {backlink}")
        return True

    # Fallback to legacy actions
    elif action == "click":
        selector = job.get("selector")
        if not selector:
            raise ValueError("click action requires selector")
        driver.click(selector)
        time.sleep(1)
        return True

    elif action == "fill_and_submit":
        fields = job.get("fields") or {}
        for selector, value in fields.items():
            driver.type(selector, str(value))
            time.sleep(0.3)
        submit_selector = job.get("submit_selector")
        if submit_selector:
            driver.click(submit_selector)
            time.sleep(1)
        return True

    raise ValueError(f"Unsupported action: {action}")


def run_worker(worker_id: int, job_queue: queue.Queue, results: list[dict[str, str]]) -> None:
    logger = get_logger(f"W{worker_id:02d}")
    logger.info("Worker %s starting", worker_id)

    driver = None
    job_count = 0

    try:
        driver = create_driver(worker_id)

        while True:
            try:
                job = job_queue.get(timeout=10)
            except queue.Empty:
                logger.info("Worker %s queue empty, shutting down", worker_id)
                break

            job_id = str(job.get("id") or "")
            retry_count = int(job.get("retry_count") or 0)

            try:
                mark_job_running(job_id)
                logger.info("Starting job %s (retry %s)", job_id, retry_count)

                if job_count > 0 and job_count % BROWSER_RESTART_EVERY == 0:
                    logger.info("Restarting browser at job count %s", job_count)
                    try:
                        driver.quit()
                    except Exception:
                        pass
                    time.sleep(2)
                    driver = create_driver(worker_id)

                if execute_job(driver, job, worker_id, logger):
                    mark_job_success(job_id)
                    metrics.inc("jobs_succeeded")
                    results.append({"id": job_id, "status": "success"})
                else:
                    raise RuntimeError("execute_job returned False")

            except Exception as e:
                error_msg = str(e)
                logger.error("Job %s error: %s", job_id, error_msg)

                if retry_count < MAX_RETRIES:
                    increment_retry(job_id, retry_count)
                    metrics.inc("retries")
                    job_queue.put({**job, "retry_count": retry_count + 1})
                    logger.info("Job %s queued for retry %s", job_id, retry_count + 1)
                else:
                    mark_job_failed(job_id, error_msg)
                    metrics.inc("jobs_failed")
                    results.append({"id": job_id, "status": "failed"})

            finally:
                job_queue.task_done()
                job_count += 1
                time.sleep(JOB_COOLDOWN)

    except Exception as e:
        logger.error("Worker %s crashed: %s", worker_id, e)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        logger.info("Worker %s finished. Jobs processed: %s", worker_id, job_count)
