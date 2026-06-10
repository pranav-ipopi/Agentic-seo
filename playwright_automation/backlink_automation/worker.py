"""
Backlink Automation Engine V1 - Worker

Main entry point.
- Polls Supabase for pending backlink jobs
- Processes one job at a time (simple polling, no queue)
- Uses site templates for execution
- Handles status transitions + retry logic (max 3 attempts)
- Logs all major events

Run with:
    python worker.py

Environment:
    See .env.example

V1 scope: Only livebookmarking.com
Future: Add more templates in templates/ following the same interface.

No Redis, no RabbitMQ, no complex orchestration (per requirements).
"""

import asyncio
import os
import signal
import sys
import traceback
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv

from services.supabase_service import SupabaseService
from services.logging_service import setup_logger, log_event
from services.captcha_service import CaptchaService
from methods.stealth_browser import StealthBrowserManager
from templates.livebookmarking import LiveBookmarkingTemplate


load_dotenv()

# Configuration
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


class BacklinkWorker:
    def __init__(self):
        self.logger = setup_logger(level=getattr(__import__("logging"), LOG_LEVEL, 20))
        self.supabase = SupabaseService(logger=self.logger)
        self.captcha_service = CaptchaService(logger=self.logger)
        self.browser_manager = StealthBrowserManager()
        self.template = LiveBookmarkingTemplate(
            browser_manager=self.browser_manager,
            captcha_service=self.captcha_service,
            logger=self.logger
        )
        self.running = True
        self._setup_signal_handlers()

    def _setup_signal_handlers(self):
        """Graceful shutdown on SIGTERM / SIGINT (Docker friendly)."""
        def shutdown(signum, frame):
            self.logger.info(f"Received signal {signum}. Shutting down gracefully...")
            self.running = False

        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)

    async def process_job(self, job: dict) -> None:
        """Process a single job using the template."""
        job_id = job.get("id")
        state = job.get("state", {})
        target_site = state.get("target_site")
        client_site = state.get("client_site")
        keyword = state.get("keyword")
        current_retry = state.get("retry_count", 0)

        log_event(
            self.logger,
            "job_picked",
            {
                "job_id": job_id,
                "target_site": target_site,
                "client_site": client_site,
                "keyword": keyword,
                "retry_count": current_retry
            }
        )

        # Lock the job to running (optimistic)
        locked = self.supabase.update_job_to_running(job_id)
        if not locked:
            self.logger.warning(f"Job {job_id} could not be locked to running (race condition?)")
            return

        log_event(self.logger, "job_running", {"job_id": job_id})

        try:
            # Execute the site-specific template
            # V1 only supports livebookmarking.com
            if target_site != "https://livebookmarking.com/":
                raise ValueError(f"Unsupported target_site in V1: {target_site}")

            result = await self.template.run(client_site, keyword)

            backlink_url = result.get("backlink_url")
            if not backlink_url:
                raise Exception("Template did not return a backlink_url")

            # Success path
            self.supabase.update_job_success(job_id, state, backlink_url)
            log_event(
                self.logger,
                "success",
                {"job_id": job_id, "backlink_url": backlink_url}
            )

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            self.logger.error(f"Job {job_id} failed: {error_msg}")
            self.logger.error(traceback.format_exc())

            # Apply retry logic
            self.supabase.update_job_failed(
                job_id=job_id,
                state=state,
                error=error_msg,
                retry_count=current_retry,
                max_retries=MAX_RETRIES
            )

            log_event(
                self.logger,
                "failure",
                {
                    "job_id": job_id,
                    "error": error_msg[:500],
                    "retry_count": current_retry + 1
                },
                level=40  # WARNING
            )

    async def poll_loop(self):
        """Main polling loop."""
        log_event(self.logger, "worker_started", {
            "version": "V1",
            "target": "livebookmarking.com",
            "poll_interval": POLL_INTERVAL,
            "max_retries": MAX_RETRIES
        })

        while self.running:
            try:
                job = self.supabase.get_pending_job()
                if job:
                    await self.process_job(job)
                else:
                    self.logger.debug("No pending jobs. Sleeping...")

                await asyncio.sleep(POLL_INTERVAL)

            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                self.logger.error(f"Unexpected error in poll loop: {e}")
                self.logger.error(traceback.format_exc())
                await asyncio.sleep(POLL_INTERVAL * 2)  # backoff on error

        # Cleanup
        self.logger.info("Worker stopping. Closing browser...")
        await self.browser_manager.close()
        log_event(self.logger, "worker_stopped")

    async def run(self):
        """Entry point."""
        try:
            await self.browser_manager.start()
            await self.poll_loop()
        except Exception as e:
            self.logger.critical(f"Fatal worker error: {e}")
            await self.browser_manager.close()
            sys.exit(1)


async def main():
    worker = BacklinkWorker()
    await worker.run()


if __name__ == "__main__":
    # Run the async worker
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Worker interrupted by user.")