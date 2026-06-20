"""
Article Submission Worker

Polls Supabase for pending article_submission task_runs and executes them
using the BrowserUse Cloud API v3 with persistent browser profiles.

Key design:
  - ONLY processes task_runs where type = 'article_submission'
  - Completely isolated from backlink_automation/worker.py
  - Uses BrowserUse Cloud API v3 for browser automation
  - Calls OpenAI to generate article body from title + description + keyword
  - Respects articles_per_day rate limit per client

Run with:
    python article_worker.py

Environment:
    See article_worker_env.example
"""

import asyncio
import json
import logging
import os
import sys
import signal
import traceback
import time
from datetime import datetime, timezone, date
from typing import Optional

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ── Configuration ─────────────────────────────────────────────────────────

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_KEY          = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BROWSER_USE_API_KEY   = os.environ["BROWSER_USE_API_KEY"]
OPENAI_API_KEY        = os.environ.get("OPENAI_API_KEY", "")

POLL_INTERVAL         = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
MAX_RETRIES           = int(os.getenv("MAX_RETRIES", "3"))
LOG_LEVEL             = os.getenv("LOG_LEVEL", "INFO").upper()

BROWSER_USE_BASE      = "https://api.browser-use.com/api/v3"
BROWSER_USE_HEADERS   = {
    "X-Browser-Use-API-Key": BROWSER_USE_API_KEY,
    "Content-Type": "application/json",
}

# Timeout to wait for BrowserUse session completion (seconds)
SESSION_TIMEOUT       = int(os.getenv("SESSION_TIMEOUT_SECONDS", "600"))   # 10 min
SESSION_POLL_INTERVAL = 10  # seconds between status checks


# ── Logger ────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("article_worker")


# ── Supabase ──────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_pending_job(sb: Client) -> Optional[dict]:
    """
    Fetch the oldest pending article_submission job.
    type = 'article_submission' ensures we NEVER touch backlink jobs.
    """
    try:
        res = (
            sb.table("task_runs")
            .select("*")
            .eq("status", "pending")
            .eq("type", "article_submission")   # ← Strict type isolation
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching pending job: {e}")
        return None


def lock_job(sb: Client, job_id: str) -> bool:
    """Optimistically move job from pending → running."""
    try:
        res = (
            sb.table("task_runs")
            .update({"status": "running", "updated_at": now_iso()})
            .eq("id", job_id)
            .eq("status", "pending")  # optimistic lock
            .execute()
        )
        return len(res.data) > 0
    except Exception as e:
        logger.error(f"Error locking job {job_id}: {e}")
        return False


def mark_success(sb: Client, job_id: str, state: dict, result_url: str) -> None:
    state["result_url"] = result_url
    state["error"] = None
    sb.table("task_runs").update({
        "status": "completed",
        "state": state,
        "updated_at": now_iso(),
    }).eq("id", job_id).execute()


def mark_failed(sb: Client, job_id: str, state: dict, error: str, retry_count: int) -> None:
    new_retry = retry_count + 1
    state["retry_count"] = new_retry
    state["error"] = error[:2000]
    new_status = "pending" if new_retry < MAX_RETRIES else "failed"
    sb.table("task_runs").update({
        "status": new_status,
        "state": state,
        "updated_at": now_iso(),
    }).eq("id", job_id).execute()


def log_to_db(sb: Client, task_run_id: str, step_index: int, role: str, message: str, metadata: dict = None) -> None:
    try:
        sb.table("task_run_logs").insert({
            "task_run_id": task_run_id,
            "step_index": step_index,
            "role": role,
            "message": message,
            "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to write log for {task_run_id}: {e}")


def check_articles_today(sb: Client, client_id: str) -> int:
    """Count how many article_submission runs completed today for this client."""
    try:
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ).isoformat()
        res = (
            sb.table("task_runs")
            .select("id", count="exact")
            .eq("client_id", client_id)
            .eq("type", "article_submission")
            .eq("status", "completed")
            .gte("updated_at", today_start)
            .execute()
        )
        return res.count or 0
    except Exception:
        return 0


def update_parent_task(sb: Client, task_id: str) -> None:
    """Check if all article task_runs for a parent task are done and update it."""
    if not task_id:
        return
    try:
        res = (
            sb.table("task_runs")
            .select("status")
            .eq("state->>task_id", task_id)
            .eq("type", "article_submission")
            .execute()
        )
        if not res.data:
            return
        statuses = [r["status"] for r in res.data]
        all_done = all(s in ("completed", "failed") for s in statuses)
        succeeded = sum(1 for s in statuses if s == "completed")
        failed    = sum(1 for s in statuses if s == "failed")
        total     = len(statuses)

        if all_done:
            final = "completed" if succeeded > 0 else "failed"
        else:
            final = "running"

        sb.table("tasks").update({
            "status": final,
            "result": {"summary": {"total": total, "succeeded": succeeded, "failed": failed}},
        }).eq("id", task_id).execute()
    except Exception as e:
        logger.warning(f"Failed to update parent task {task_id}: {e}")


# ── LLM Article Body Generation ───────────────────────────────────────────

async def generate_article_body(
    title: str,
    description: str,
    keyword: str,
    client_url: str,
    platform_name: str,
) -> str:
    """
    Calls OpenAI GPT-4o-mini to generate a 600–800 word article body.
    Falls back to a structured template if OPENAI_API_KEY is not set.
    """
    if not OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set — using template fallback for article body.")
        return _fallback_article_body(title, description, keyword, client_url)

    system_prompt = (
        "You are a professional SEO content writer. Write a high-quality, "
        "informative article that reads naturally and includes the target keyword "
        "organically. The article should be between 600 and 800 words, structured "
        "with clear headings (H2/H3), and include a subtle backlink to the client URL "
        "within the body text. Write in plain text — no markdown formatting needed "
        "since this will be pasted directly into a blog editor."
    )

    user_prompt = (
        f"Write an article for the platform '{platform_name}'.\n\n"
        f"Title: {title}\n"
        f"Target keyword: {keyword}\n"
        f"Description / Brief: {description or 'No additional instructions.'}\n"
        f"Client URL to link naturally within the article: {client_url}\n\n"
        "Write the full article body now (not the title, just the body):"
    )

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                "max_tokens": 1200,
                "temperature": 0.7,
            },
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"].strip()


def _fallback_article_body(title: str, description: str, keyword: str, client_url: str) -> str:
    return (
        f"{title}\n\n"
        f"{description or 'This article covers important aspects of the topic.'}\n\n"
        f"When it comes to {keyword}, there are several key considerations to keep in mind. "
        f"Professionals across the industry have highlighted the importance of staying updated "
        f"with best practices and leveraging the right tools.\n\n"
        f"For more information and resources, visit {client_url}.\n\n"
        f"Key Takeaways:\n"
        f"- Understanding {keyword} is essential for success\n"
        f"- Implementing proven strategies leads to better outcomes\n"
        f"- Continuous learning and adaptation are critical\n\n"
        f"Conclusion: Staying informed about {keyword} and related topics will help you "
        f"achieve your goals. Explore more at {client_url}."
    )


# ── BrowserUse API ────────────────────────────────────────────────────────

async def create_browser_session(profile_id: str, task: str) -> str:
    """Create a BrowserUse v3 session with the given profile and task. Returns session_id."""
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{BROWSER_USE_BASE}/sessions",
            headers=BROWSER_USE_HEADERS,
            json={"profile_id": profile_id, "task": task},
        )
        res.raise_for_status()
        data = res.json()
        session_id = data.get("id") or data.get("session_id")
        if not session_id:
            raise ValueError(f"No session_id in BrowserUse response: {data}")
        logger.info(f"BrowserUse session created: {session_id}")
        return session_id


async def wait_for_session(session_id: str) -> dict:
    """Poll the session until it's completed or failed. Returns final session data."""
    deadline = time.time() + SESSION_TIMEOUT
    async with httpx.AsyncClient(timeout=30) as client:
        while time.time() < deadline:
            res = await client.get(
                f"{BROWSER_USE_BASE}/sessions/{session_id}",
                headers=BROWSER_USE_HEADERS,
            )
            res.raise_for_status()
            data = res.json()
            status = data.get("status", "").lower()
            logger.debug(f"BrowserUse session {session_id} status: {status}")

            if status in ("completed", "finished", "success"):
                return data
            if status in ("failed", "error", "stopped"):
                raise RuntimeError(f"BrowserUse session {session_id} ended with status: {status}")

            await asyncio.sleep(SESSION_POLL_INTERVAL)

    raise TimeoutError(f"BrowserUse session {session_id} timed out after {SESSION_TIMEOUT}s")


async def stop_browser_session(session_id: str) -> None:
    """Stop a BrowserUse session to persist profile state."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{BROWSER_USE_BASE}/sessions/{session_id}/stop",
                headers=BROWSER_USE_HEADERS,
            )
        logger.info(f"BrowserUse session {session_id} stopped — profile state saved.")
    except Exception as e:
        logger.warning(f"Failed to stop session {session_id}: {e}")


# ── Job Processor ─────────────────────────────────────────────────────────

async def process_job(sb: Client, job: dict) -> None:
    job_id    = job["id"]
    state     = job.get("state", {})
    client_id = job.get("client_id")
    retry_count = state.get("retry_count", 0)

    # Extract config from state
    profile_id          = state.get("profile_id", "")
    platform_name       = state.get("platform_name", "")
    platform_url        = state.get("platform_url", "")
    article_title       = state.get("article_title", "")
    article_description = state.get("article_description", "")
    keyword             = state.get("keyword", "")
    client_target_url   = state.get("client_target_url", "")
    articles_per_day    = state.get("articles_per_day", 5)
    task_id             = state.get("task_id")

    logger.info(
        f"[Job {job_id}] platform={platform_name} keyword='{keyword}' "
        f"retry={retry_count}"
    )

    # ── Rate limit check ──
    done_today = check_articles_today(sb, client_id)
    if done_today >= articles_per_day:
        logger.info(
            f"[Job {job_id}] Rate limit reached for client {client_id}: "
            f"{done_today}/{articles_per_day} today. Skipping — will retry next poll."
        )
        return  # Leave as pending — will be picked up next day

    # ── Lock job ──
    if not lock_job(sb, job_id):
        logger.warning(f"[Job {job_id}] Could not lock — skipping (race condition?)")
        return

    log_to_db(sb, job_id, 0, "system",
              f"Starting article submission to {platform_name} for keyword: '{keyword}'",
              {"status": "running", "platform": platform_name})

    session_id = None
    try:
        # ── Step 1: Generate article body via LLM ──
        logger.info(f"[Job {job_id}] Generating article body via LLM...")
        article_body = await generate_article_body(
            title=article_title,
            description=article_description,
            keyword=keyword,
            client_url=client_target_url,
            platform_name=platform_name,
        )
        logger.info(f"[Job {job_id}] Article body generated ({len(article_body)} chars)")

        # ── Step 2 & 3: Build task and create BrowserUse session ──
        browser_task = (
            f"Go to {platform_url} and log in using the existing account in this browser profile. "
            f"Create a new article/post/blog with the following:\n\n"
            f"Title: {article_title}\n\n"
            f"Body:\n{article_body}\n\n"
            f"Make sure the article includes a hyperlink to: {client_target_url}\n"
            f"Publish the article. "
            f"After publishing, return the URL of the published article."
        )

        logger.info(f"[Job {job_id}] Creating BrowserUse session with profile {profile_id} and submitting task...")
        session_id = await create_browser_session(profile_id, browser_task)

        log_to_db(sb, job_id, 0, "assistant",
                  f"BrowserUse session started. Submitting article to {platform_name}...",
                  {"session_id": session_id, "status": "browser_running"})

        # ── Step 4: Poll until done ──
        logger.info(f"[Job {job_id}] Waiting for BrowserUse session to complete...")
        session_data = await wait_for_session(session_id)

        # Extract result URL if available
        result_url = (
            session_data.get("result")
            or session_data.get("output")
            or session_data.get("final_url")
            or f"https://{platform_url}"
        )
        if isinstance(result_url, dict):
            result_url = result_url.get("url") or str(result_url)

        # ── Step 5: Stop session (saves profile state) ──
        await stop_browser_session(session_id)

        # ── Success ──
        mark_success(sb, job_id, state, str(result_url))
        update_parent_task(sb, task_id)

        log_to_db(sb, job_id, 1, "assistant",
                  f"[OK] Article successfully submitted to {platform_name}. URL: {result_url}",
                  {"status": "completed", "result_url": str(result_url)})

        logger.info(f"[Job {job_id}] [OK] Completed. Result: {result_url}")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"[Job {job_id}] [FAIL] Failed: {error_msg}")
        logger.error(traceback.format_exc())

        # Try to stop session gracefully to preserve profile
        if session_id:
            await stop_browser_session(session_id)

        mark_failed(sb, job_id, state, error_msg, retry_count)
        update_parent_task(sb, task_id)

        log_to_db(sb, job_id, 0, "system",
                  f"[FAIL] Article submission failed: {error_msg}",
                  {"status": "failed", "error": error_msg[:500]})


# ── Main Poll Loop ─────────────────────────────────────────────────────────

class ArticleWorker:
    def __init__(self):
        self.running = True
        signal.signal(signal.SIGTERM, self._shutdown)
        signal.signal(signal.SIGINT,  self._shutdown)

    def _shutdown(self, signum, frame):
        logger.info(f"Signal {signum} received — shutting down gracefully...")
        self.running = False

    async def run(self):
        logger.info("=" * 60)
        logger.info("  Article Submission Worker — Started")
        logger.info(f"  Poll interval : {POLL_INTERVAL}s")
        logger.info(f"  Max retries   : {MAX_RETRIES}")
        logger.info(f"  LLM enabled   : {bool(OPENAI_API_KEY)}")
        logger.info("=" * 60)

        sb = get_supabase()

        while self.running:
            try:
                job = get_pending_job(sb)
                if job:
                    logger.info(f"Picked up job: {job['id']}")
                    await process_job(sb, job)
                else:
                    logger.debug("No pending article jobs. Sleeping...")

            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                logger.error(f"Unexpected error in poll loop: {e}")
                logger.error(traceback.format_exc())
                # Recreate Supabase client on connection error
                try:
                    sb = get_supabase()
                except Exception:
                    pass
                await asyncio.sleep(POLL_INTERVAL * 2)
                continue

            await asyncio.sleep(POLL_INTERVAL)

        logger.info("Article Worker stopped.")


async def main():
    worker = ArticleWorker()
    await worker.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nWorker interrupted by user.")
