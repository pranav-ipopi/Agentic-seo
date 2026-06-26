"""
Failure Handler for Backlink Automation (SeleniumBase version)

Responsibilities:
    - Classify errors into structured error_type categories
    - Capture evidence (screenshot, HTML dump, current URL) on failure
    - Log structured failure data to task_run_logs
    - Update target_sites health status (active → failing → down)
    - Track consecutive failures per site
"""

import os
import logging
import traceback
from datetime import datetime, timezone
from typing import Optional


class AutomationError(Exception):
    def __init__(self, message, error_type="UNKNOWN", step="unknown"):
        super().__init__(message)
        self.error_type = error_type
        self.step = step


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
        if isinstance(error, AutomationError):
            return error.error_type

        error_name = type(error).__name__.lower()
        error_str = str(error).lower()

        if any(kw in error_name for kw in self._TIMEOUT_KEYWORDS):
            return "TIMEOUT"

        if any(kw in error_str for kw in self._CONNECTION_KEYWORDS):
            return "SITE_DOWN"

        if "locator" in error_str and ("timeout" in error_str or "waiting" in error_str):
            return "SELECTOR_NOT_FOUND"

        return "UNKNOWN"

    def capture_evidence(self, driver, task_run_id: str, step: str) -> dict:
        """Capture a screenshot and HTML dump from the current SeleniumBase driver."""
        evidence = {}

        if not driver:
            return evidence

        # Screenshot
        try:
            date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            filename = f"{task_run_id}_{step}_{int(datetime.now(timezone.utc).timestamp())}.png"
            local_path = f"failures/{date_str}/{filename}"
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            driver.save_screenshot(local_path)
            
            with open(local_path, "rb") as f:
                screenshot_bytes = f.read()
                
            remote_path = f"failures/{date_str}/{filename}"
            self.supabase.storage.from_('log_screenshots').upload(
                remote_path,
                screenshot_bytes,
                {"content-type": "image/png"}
            )
            
            public_url = self.supabase.storage.from_('log_screenshots').get_public_url(remote_path)
            evidence["screenshot_path"] = public_url
            self.logger.info(f"Failure screenshot uploaded: {public_url}")
        except Exception as e:
            self.logger.warning(f"Failed to capture/upload screenshot: {e}")

        # HTML dump (truncated to 50KB to avoid bloating logs)
        try:
            html = driver.get_page_source()
            evidence["html_dump"] = html[:50000] if len(html) > 50000 else html
        except Exception:
            pass

        # Current URL
        try:
            evidence["current_url"] = driver.get_current_url()
        except Exception:
            pass

        return evidence

    def handle_failure(
        self,
        task_run_id: str,
        target_site_id: Optional[str],
        template_type: str,
        error: Exception,
        driver=None,
        step: str = "unknown"
    ):
        full_traceback = "".join(traceback.format_exception(type(error), error, error.__traceback__))

        if isinstance(error, AutomationError) and getattr(error, 'step', None):
            step = error.step

        error_type = self.classify_error(error)

        self.logger.error(
            f"[FailureHandler] {error_type} at step '{step}' for site {target_site_id}: {error}"
        )

        evidence = {}
        if driver:
            evidence = self.capture_evidence(driver, task_run_id, step)

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
                    'current_url': evidence.get('current_url'),
                    'traceback': full_traceback
                }
            }).execute()
        except Exception as e:
            self.logger.error(f"[FailureHandler] Failed to log failure to DB: {e}")

        self._update_site_health(target_site_id, success=False, error_type=error_type)

    def handle_success(self, target_site_id: Optional[str]):
        self._update_site_health(target_site_id, success=True)

    def _update_site_health(
        self,
        target_site_id: Optional[str],
        success: bool,
        error_type: Optional[str] = None
    ):
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

                if error_type == 'SITE_DOWN':
                    health = 'down'
                elif new_failures >= self.FAILING_THRESHOLD:
                    health = 'failing'
                else:
                    health = current_status

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
