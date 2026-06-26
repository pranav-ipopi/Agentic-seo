from __future__ import annotations

import queue
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from config import BATCH_SLEEP_SECONDS, JOBS_PER_BATCH, NUM_WORKERS, POLL_SLEEP_SECONDS
from db import fetch_pending_jobs, recover_stale_running_jobs
from metrics import metrics
from logger_setup import get_logger
from worker import run_worker

logger = get_logger("MAIN")


def run_batch() -> None:
    logger.info("=" * 60)
    logger.info("BookmarkBot starting — %s", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("=" * 60)

    recover_stale_running_jobs(stale_after_minutes=60)

    jobs = fetch_pending_jobs(limit=JOBS_PER_BATCH)
    if not jobs:
        logger.info("No pending jobs found. Sleeping %s seconds.", POLL_SLEEP_SECONDS)
        time.sleep(POLL_SLEEP_SECONDS)
        return

    job_queue: queue.Queue = queue.Queue()
    for job in jobs:
        job_queue.put(job)

    logger.info("Loaded %s jobs across %s workers", job_queue.qsize(), NUM_WORKERS)
    results: list[dict[str, str]] = []
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = [executor.submit(run_worker, i, job_queue, results) for i in range(NUM_WORKERS)]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                logger.error("Worker thread error: %s", e)

    elapsed = time.time() - start_time
    success = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info("=" * 60)
    logger.info("Batch complete in %.1f minutes", elapsed / 60)
    logger.info("Success: %s | Failed: %s", success, failed)
    logger.info("Metrics: %s", metrics.snapshot())
    logger.info("=" * 60)


if __name__ == "__main__":
    while True:
        try:
            run_batch()
            logger.info("Sleeping %s seconds before next batch check...", BATCH_SLEEP_SECONDS)
            time.sleep(BATCH_SLEEP_SECONDS)
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            break
        except Exception as e:
            logger.error("Main loop crashed: %s — restarting in 60s", e)
            time.sleep(60)
