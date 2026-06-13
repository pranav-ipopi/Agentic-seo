"""
Supabase Service for Backlink Automation V1

Handles all database interactions with Supabase.

Tables used:
  - task_runs:    Backlink automation jobs (poll/lock/update)
  - target_sites: Known target sites. site_id column stores the detected
                  CMS template (e.g. "wordpress_submitpro", "pligg").
                  Template detection is performed by the Python worker using
                  StealthBrowserManager (replaces the deleted Supabase Edge Function).

Worker responsibilities implemented here:
- Poll for pending jobs (task_runs)
- Lock job to "running"
- Update status, backlink_url, error, retry_count
- Fetch sites with undetected templates (target_sites where site_id IS NULL)
- Write detected template back to target_sites.site_id

Keep simple - no queues, direct polling.

Usage:
    service = SupabaseService()
    job = await service.get_pending_job()
    await service.update_job_status(job_id, "running")
    ...
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from supabase import create_client, Client
from dotenv import load_dotenv


load_dotenv()


class SupabaseService:
    def __init__(
        self,
        url: Optional[str] = None,
        key: Optional[str] = None,
        logger: Optional[logging.Logger] = None
    ):
        self.url = url or os.getenv("SUPABASE_URL")
        self.key = key or os.getenv("SUPABASE_ANON_KEY")
        self.logger = logger or logging.getLogger(__name__)

        if not self.url or not self.key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment or passed to constructor. "
                "See .env.example"
            )

        self.client: Client = create_client(self.url, self.key)
        self.table_name = "task_runs"
        self.logger.info("SupabaseService initialized")

    def _get_now(self) -> str:
        """ISO format timestamp for updated_at."""
        return datetime.now(timezone.utc).isoformat()

    def get_pending_job(self) -> Optional[Dict[str, Any]]:
        """
        Fetch the oldest pending job.
        Returns the full job dict or None.
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select("*")
                .eq("status", "pending")
                .order("created_at", desc=False)
                .limit(1)
                .execute()
            )
            if response.data:
                job = response.data[0]
                self.logger.info(f"Found pending job id={job.get('id')}")
                return job
            return None
        except Exception as e:
            self.logger.error(f"Error fetching pending job: {e}")
            raise

    def update_job_to_running(self, job_id: Any) -> bool:
        """Atomically move job from pending to running (simple update for V1)."""
        try:
            response = (
                self.client.table(self.table_name)
                .update({
                    "status": "running",
                    "updated_at": self._get_now()
                })
                .eq("id", job_id)
                .eq("status", "pending")  # optimistic lock-ish
                .execute()
            )
            updated = len(response.data) > 0
            if updated:
                self.logger.info(f"Job {job_id} locked to running")
            else:
                self.logger.warning(f"Job {job_id} was not pending when trying to lock")
            return updated
        except Exception as e:
            self.logger.error(f"Error updating job to running: {e}")
            raise

    def update_job_success(self, job_id: Any, state: dict, backlink_url: str) -> bool:
        """Mark job as completed and store the created backlink URL in state."""
        try:
            state["backlink_url"] = backlink_url
            state["error"] = None
            response = (
                self.client.table(self.table_name)
                .update({
                    "status": "completed",
                    "state": state,
                    "updated_at": self._get_now()
                })
                .eq("id", job_id)
                .execute()
            )
            self.logger.info(f"Job {job_id} marked completed with backlink_url={backlink_url}")
            return True
        except Exception as e:
            self.logger.error(f"Error updating job success: {e}")
            raise

    def update_job_failed(
        self,
        job_id: Any,
        state: dict,
        error: str,
        retry_count: int,
        max_retries: int = 3
    ) -> bool:
        """
        Handle failure + retry logic.
        If retry_count < max_retries: set status back to 'pending'
        Else: set to 'failed'
        """
        try:
            new_retry = retry_count + 1
            state["retry_count"] = new_retry
            state["error"] = error[:2000] if error else None
            if new_retry < max_retries:
                new_status = "pending"
                self.logger.info(f"Job {job_id} failed (attempt {new_retry}), returning to pending")
            else:
                new_status = "failed"
                self.logger.warning(f"Job {job_id} failed permanently after {new_retry} attempts")

            response = (
                self.client.table(self.table_name)
                .update({
                    "status": new_status,
                    "state": state,
                    "updated_at": self._get_now()
                })
                .eq("id", job_id)
                .execute()
            )
            return True
        except Exception as e:
            self.logger.error(f"Error updating job failed: {e}")
            raise

    def get_job(self, job_id: Any) -> Optional[Dict[str, Any]]:
        """Fetch a single job by id (useful for verification)."""
        try:
            response = (
                self.client.table(self.table_name)
                .select("*")
                .eq("id", job_id)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            self.logger.error(f"Error fetching job {job_id}: {e}")
            raise

    # ----------------------------------------------------------------
    # Template detection helpers (Playwright-based, replaces Edge Function)
    # ----------------------------------------------------------------

    def get_undetected_sites(self, limit: int = 5) -> list:
        """
        Return active target_sites rows where site_id has not been detected yet.

        Args:
            limit: Maximum number of sites to return per call.

        Returns:
            List of dicts with at least {'id': ..., 'url': ...}
        """
        try:
            response = (
                self.client.table("target_sites")
                .select("id, url")
                .is_("site_id", "null")
                .eq("is_active", True)
                .limit(limit)
                .execute()
            )
            sites = response.data or []
            if sites:
                self.logger.info(
                    f"[TemplateDetection] Found {len(sites)} undetected site(s) to fingerprint."
                )
            return sites
        except Exception as e:
            self.logger.error(f"[TemplateDetection] Error fetching undetected sites: {e}")
            return []

    def update_site_template(self, target_site_id: str, template_name: str) -> bool:
        """
        Write the detected CMS template back to target_sites.site_id.

        Args:
            target_site_id: The UUID of the target_sites row.
            template_name:  The detected template string
                            (e.g. "wordpress_submitpro", "pligg", "unknown").

        Returns:
            True on success, False on failure.
        """
        try:
            self.client.table("target_sites").update(
                {"site_id": template_name}
            ).eq("id", target_site_id).execute()
            self.logger.info(
                f"[TemplateDetection] Updated target_site {target_site_id} → site_id={template_name}"
            )
            return True
        except Exception as e:
            self.logger.error(
                f"[TemplateDetection] Failed to update site_id for {target_site_id}: {e}"
            )
            return False

    # For future: batch operations, etc. Keep V1 minimal.