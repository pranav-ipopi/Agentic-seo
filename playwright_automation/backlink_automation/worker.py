"""
Backlink Automation Engine - Simple Worker

Simple polling worker for single-site execution.
Uses TemplateRunner for config-driven template resolution.

- Polls Supabase for pending backlink jobs (task_runs)
- Processes one job at a time (simple polling, no queue)
- Uses TemplateRunner for extensible template routing
- Handles status transitions + retry logic (max 3 attempts)
- Logs all major events

Run with:
    python worker.py

Environment:
    See .env.example

No Redis, no RabbitMQ, no complex orchestration (per requirements).
"""

import asyncio
import os
import signal
import sys
import traceback
from datetime import datetime
from typing import Optional

# Ensure we can import from the backlink_automation directory directly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

from services.supabase_service import SupabaseService
from services.redis_service import RedisService
from services.logging_service import setup_logger, log_event
from services.captcha_service import CaptchaService
from services.template_detector import TemplateDetector
from methods.stealth_browser import StealthBrowserManager
from executor.runner import TemplateRunner
from executor.failure_handler import FailureHandler


load_dotenv()

# Configuration
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "30"))
DETECT_INTERVAL = int(os.getenv("DETECT_INTERVAL_SECONDS", "60"))  # how often to scan for undetected sites
DETECT_BATCH = int(os.getenv("DETECT_BATCH_SIZE", "5"))            # sites to fingerprint per cycle
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


class BacklinkWorker:
    def __init__(self):
        self.logger = setup_logger(level=getattr(__import__("logging"), LOG_LEVEL, 20))
        self.supabase = SupabaseService(logger=self.logger)
        self.redis = RedisService(logger=self.logger)
        self.captcha_service = CaptchaService(logger=self.logger)
        self.browser_manager = StealthBrowserManager()
        self.template_runner = TemplateRunner()
        self.template_detector = TemplateDetector(self.browser_manager, self.logger)
        self.failure_handler = FailureHandler(self.supabase.client, self.logger)
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
        """Process a single job using the TemplateRunner."""
        job_id = job.get("id")
        state = job.get("state", {})
        target_site = state.get("target_site")
        client_site = state.get("client_site")
        keyword = state.get("keyword")
        current_retry = state.get("retry_count", 0)
        target_site_id = job.get("target_site_id")

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
            # Determine site_id for routing
            site_id = None
            if target_site_id:
                site_res = self.supabase.client.table('target_sites').select('site_id').eq('id', target_site_id).execute()
                if site_res.data and len(site_res.data) > 0:
                    site_id = (site_res.data[0].get('site_id') or '').lower() or None

            if not site_id or not self.template_runner.is_supported(site_id):
                raise ValueError(
                    f"Unsupported or undetected template: site_id={site_id!r} for {target_site}. "
                    f"Supported: {self.template_runner.get_supported_templates()}"
                )

            # Execute via TemplateRunner
            result = await self.template_runner.execute(
                site_id=site_id,
                target_url=target_site,
                target_site_db_id=target_site_id,
                client_url=client_site,
                keyword=keyword,
                browser_manager=self.browser_manager,
                captcha_service=self.captcha_service,
                logger=self.logger
            )

            backlink_url = result.get("backlink_url")
            if not backlink_url:
                raise Exception("Template did not return a backlink_url")

            # Success path
            self.supabase.update_job_success(job_id, state, backlink_url)
            await self.failure_handler.handle_success(target_site_id)
            log_event(
                self.logger,
                "success",
                {"job_id": job_id, "backlink_url": backlink_url}
            )

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            self.logger.error(f"Job {job_id} failed: {error_msg}")
            self.logger.error(traceback.format_exc())

            # Classify and log failure
            await self.failure_handler.handle_failure(
                task_run_id=job_id,
                target_site_id=target_site_id,
                template_type=site_id if 'site_id' in locals() else "unknown",
                error=e,
                step="execution"
            )

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

    async def detect_loop(self):
        """
        Secondary loop: periodically scans for target_sites with no detected
        template (site_id IS NULL) and fingerprints them via the stealth browser.

        Runs concurrently with poll_loop() via asyncio.gather.
        """
        self.logger.info(
            f"[DetectLoop] Started — interval={DETECT_INTERVAL}s, batch={DETECT_BATCH}"
        )

        while self.running:
            try:
                sites = self.supabase.get_undetected_sites(limit=DETECT_BATCH)

                if not sites:
                    self.logger.debug("[DetectLoop] No undetected sites. Sleeping...")
                else:
                    for site in sites:
                        if not self.running:
                            break
                        site_id_db = site.get("id")
                        url = site.get("url", "").strip()
                        if not url:
                            continue

                        self.logger.info(f"[DetectLoop] Fingerprinting: {url}")
                        try:
                            detected = await self.template_detector.detect(url)
                            if detected is not None:
                                # Only write to DB when we have a confident match
                                self.supabase.update_site_template(site_id_db, detected)
                                log_event(
                                    self.logger,
                                    "template_detected",
                                    {"url": url, "template": detected}
                                )
                            else:
                                # Leave site_id = NULL so it retries next cycle
                                self.logger.warning(
                                    f"[DetectLoop] Could not fingerprint {url} — "
                                    f"leaving site_id NULL for retry in {DETECT_INTERVAL}s"
                                )
                        except Exception as e:
                            self.logger.error(
                                f"[DetectLoop] Detection failed for {url}: {e}"
                            )

            except Exception as e:
                self.logger.error(f"[DetectLoop] Unexpected error: {e}")

            await asyncio.sleep(DETECT_INTERVAL)

        self.logger.info("[DetectLoop] Stopped.")

    async def poll_loop(self):
        """Main polling loop."""
        log_event(self.logger, "worker_started", {
            "version": "V2",
            "supported_templates": str(self.template_runner.get_supported_templates()),
            "poll_interval": POLL_INTERVAL,
            "max_retries": MAX_RETRIES,
            "queue_mode": "redis" if self.redis.client else "supabase"
        })

        while self.running:
            try:
                if self.redis.client:
                    # Block for up to 5 seconds to allow graceful shutdown
                    job = await self.redis.pop_job(timeout=5)
                else:
                    job = self.supabase.get_pending_job()
                
                if job:
                    await self.process_job(job)
                else:
                    if not self.redis.client:
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
        """Entry point — runs the job loop and detection loop concurrently."""
        try:
            await self.browser_manager.start()
            await asyncio.gather(
                self.poll_loop(),
                self.detect_loop()
            )
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