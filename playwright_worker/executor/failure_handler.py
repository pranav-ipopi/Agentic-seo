"""
Failure Handler for Backlink Automation

Responsibilities:
    - Classify errors into structured error_type categories
    - Capture evidence (screenshot, HTML dump, current URL) on failure
    - Log structured failure data to task_run_logs
    - Update target_sites health status (active → failing → down)
    - Track consecutive failures per site

Health status transitions:
    active  → failing   (5+ consecutive failures)
    active  → down      (SITE_DOWN error detected)
    failing → active    (next successful run)
    down    → active    (next successful run)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from executor.errors import AutomationError


class FailureHandler:
    """Handles failure classification, evidence capture, and site health tracking."""

    # Error type classification for non-AutomationError exceptions
    _TIMEOUT_KEYWORDS = ["timeouterror", "timeout"]
    _CONNECTION_KEYWORDS = ["net::err_connection", "net::err_name", "dns", "connection refused"]

    # Number of consecutive failures before marking a site as "failing"
    FAILING_THRESHOLD = 5

    def __init__(self, supabase_client, logger: Optional[logging.Logger] = None):
        self.supabase = supabase_client
        self.logger = logger or logging.getLogger(__name__)

    def classify_error(self, error: Exception) -> str:
        """
        Classify an exception into a structured error_type string.

        Returns one of:
            SITE_DOWN, TIMEOUT, SELECTOR_NOT_FOUND, LOGIN_FAILED,
            REGISTRATION_FAILED, SUBMISSION_FAILED, CAPTCHA_FAILED,
            UNSUPPORTED_TEMPLATE, UNKNOWN
        """
        # If it's already a typed AutomationError, use its error_type
        if isinstance(error, AutomationError):
            return error.error_type

        error_name = type(error).__name__.lower()
        error_str = str(error).lower()

        # Timeout detection
        if any(kw in error_name for kw in self._TIMEOUT_KEYWORDS):
            return "TIMEOUT"

        # Connection/site down detection
        if any(kw in error_str for kw in self._CONNECTION_KEYWORDS):
            return "SITE_DOWN"

        # Playwright selector timeout usually means element not found
        if "locator" in error_str and ("timeout" in error_str or "waiting" in error_str):
            return "SELECTOR_NOT_FOUND"

        return "UNKNOWN"

    async def capture_evidence(self, page, task_run_id: str, step: str) -> dict:
        """
        Capture a screenshot and HTML dump from the current page.
        Returns a dict with paths/content for structured logging.
        """
        evidence = {}

        if not page:
            return evidence

        # Screenshot
        try:
            screenshot_bytes = await page.screenshot(full_page=True)
            date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            file_name = f"failures/{date_str}/{task_run_id}_{step}_{int(datetime.now(timezone.utc).timestamp())}.png"
            
            # Upload to Supabase Storage
            self.supabase.storage.from_('log_screenshots').upload(
                file_name,
                screenshot_bytes,
                {"content-type": "image/png"}
            )
            
            # Get public URL
            public_url = self.supabase.storage.from_('log_screenshots').get_public_url(file_name)
            evidence["screenshot_path"] = public_url
            self.logger.info(f"Failure screenshot uploaded: {public_url}")
        except Exception as e:
            self.logger.warning(f"Failed to capture/upload screenshot: {e}")

        # HTML dump (truncated to 50KB to avoid bloating logs)
        try:
            html = await page.content()
            evidence["html_dump"] = html[:50000] if len(html) > 50000 else html
        except Exception:
            pass

        # Current URL
        try:
            evidence["current_url"] = page.url
        except Exception:
            pass

        return evidence

    async def capture_console_logs(self, task_run_id: str, step: str) -> Optional[str]:
        """
        Extract logs for the specific task run and upload to Supabase.
        """
        import re
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            log_path = os.path.join(base_dir, "logs", "backlink_automation.log")
            if not os.path.exists(log_path):
                return None

            with open(log_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            job_logs = []
            
            # Capture the last 300 lines of the log file to show "nearby" logs globally
            recent_lines = lines[-300:] if len(lines) > 300 else lines
            
            job_logs.append("--- RECENT CONSOLE LOGS (LAST 300 LINES) ---\n")
            job_logs.extend(recent_lines)
                    
            if job_logs:
                log_content = "".join(job_logs)
                date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                file_name = f"failures/{date_str}/{task_run_id}_{step}_logs_{int(datetime.now(timezone.utc).timestamp())}.txt"
                
                # Upload to Supabase Storage
                self.supabase.storage.from_('log_screenshots').upload(
                    file_name,
                    log_content.encode('utf-8'),
                    {"content-type": "text/plain"}
                )
                
                # Get public URL
                public_url = self.supabase.storage.from_('log_screenshots').get_public_url(file_name)
                self.logger.info(f"Failure logs uploaded: {public_url}")
                return public_url
                
        except Exception as e:
            self.logger.warning(f"Failed to capture/upload console logs: {e}")
            
        return None

    async def handle_failure(
        self,
        task_run_id: str,
        target_site_id: Optional[str],
        template_type: str,
        error: Exception,
        page=None,
        step: str = "unknown"
    ):
        """
        Full failure handling pipeline:
        1. Classify the error
        2. Capture evidence if page is available
        3. Log to task_run_logs with structured metadata
        4. Update target_sites health status
        """
        import traceback
        full_traceback = "".join(traceback.format_exception(type(error), error, error.__traceback__))

        if isinstance(error, AutomationError) and getattr(error, 'step', None):
            step = error.step

        error_type = self.classify_error(error)

        self.logger.error(
            f"[FailureHandler] {error_type} at step '{step}' for site {target_site_id}: {error}"
        )

        # Capture evidence
        evidence = {}
        if page:
            evidence = await self.capture_evidence(page, task_run_id, step)
            
        # Capture console logs
        console_logs_url = await self.capture_console_logs(task_run_id, step)
        if console_logs_url:
            evidence['console_logs_path'] = console_logs_url

        # Log to task_run_logs with structured metadata
        try:
            self.supabase.table('task_run_logs').insert({
                'task_run_id': task_run_id,
                'step_index': 0,
                'role': 'system',
                'message': f"FAILURE: {error_type} at step '{step}': {str(error)[:500]}",
                'metadata': {
                    'error_type': error_type,
                    'step': step,
                    'template': template_type,
                    'target_site_id': str(target_site_id) if target_site_id else None,
                    'screenshot_path': evidence.get('screenshot_path'),
                    'console_logs_path': evidence.get('console_logs_path'),
                    'current_url': evidence.get('current_url'),
                    'traceback': full_traceback
                }
            }).execute()
        except Exception as e:
            self.logger.error(f"[FailureHandler] Failed to log failure to DB: {e}")

        # Update site health
        await self._update_site_health(target_site_id, success=False, error_type=error_type)

    async def handle_success(self, target_site_id: Optional[str]):
        """Update site health on successful execution."""
        await self._update_site_health(target_site_id, success=True)

    async def _update_site_health(
        self,
        target_site_id: Optional[str],
        success: bool,
        error_type: Optional[str] = None
    ):
        """
        Update target_sites health tracking columns.

        On success:
            - Reset consecutive_failures to 0
            - Set health_status to 'active'
            - Update last_success_at

        On failure:
            - Increment consecutive_failures
            - Set health_status based on error_type and failure count
            - Update last_failure_at and last_error_type
        """
        if not target_site_id:
            return

        now = datetime.now(timezone.utc).isoformat()

        try:
            if success:
                self.supabase.table('target_sites').update({
                    'last_success_at': now,
                    'consecutive_failures': 0,
                    'health_status': 'active'
                }).eq('id', target_site_id).execute()

            else:
                # Fetch current failure count
                site_res = self.supabase.table('target_sites') \
                    .select('consecutive_failures, health_status') \
                    .eq('id', target_site_id) \
                    .execute()

                current_failures = 0
                current_status = 'active'
                if site_res.data and len(site_res.data) > 0:
                    current_failures = site_res.data[0].get('consecutive_failures') or 0
                    current_status = site_res.data[0].get('health_status', 'active')

                new_failures = current_failures + 1

                # Determine health status
                if error_type == 'SITE_DOWN':
                    health = 'down'
                elif new_failures >= self.FAILING_THRESHOLD:
                    health = 'failing'
                else:
                    health = current_status  # Keep current status if below threshold

                self.supabase.table('target_sites').update({
                    'last_failure_at': now,
                    'last_error_type': error_type,
                    'consecutive_failures': new_failures,
                    'health_status': health
                }).eq('id', target_site_id).execute()

                self.logger.info(
                    f"[FailureHandler] Site {target_site_id} health updated: "
                    f"failures={new_failures}, status={health}"
                )

        except Exception as e:
            self.logger.error(f"[FailureHandler] Failed to update site health: {e}")
