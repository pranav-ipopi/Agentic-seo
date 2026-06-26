from __future__ import annotations

import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Any

from logger_setup import get_logger

logger = get_logger("DB")

DB_PATH = "local.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_pending_jobs(limit: int = 500) -> list[dict[str, Any]]:
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM jobs WHERE status = 'pending' LIMIT ?",
                (limit,)
            )
            rows = cursor.fetchall()
            jobs = [dict(row) for row in rows]
            logger.info("Fetched %s pending jobs", len(jobs))
            return jobs
    except Exception as e:
        logger.error("Failed to fetch jobs: %s", e)
        return []


def mark_job_running(job_id: str) -> None:
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?",
                (_now_iso(), job_id)
            )
    except Exception as e:
        logger.error("Failed to mark job %s running: %s", job_id, e)


def mark_job_success(job_id: str) -> None:
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'completed', error_message = NULL, updated_at = ? WHERE id = ?",
                (_now_iso(), job_id)
            )
        logger.info("Job %s marked complete", job_id)
    except Exception as e:
        logger.error("Failed to mark job %s complete: %s", job_id, e)


def mark_job_failed(job_id: str, error: str) -> None:
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
                (error[:2000], _now_iso(), job_id)
            )
        logger.warning("Job %s marked failed: %s", job_id, error)
    except Exception as e:
        logger.error("Failed to mark job %s failed: %s", job_id, e)


def increment_retry(job_id: str, retry_count: int) -> None:
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'pending', retry_count = ?, updated_at = ? WHERE id = ?",
                (retry_count + 1, _now_iso(), job_id)
            )
    except Exception as e:
        logger.error("Failed to increment retry for job %s: %s", job_id, e)


def recover_stale_running_jobs(stale_after_minutes: int = 60) -> int:
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=stale_after_minutes)).isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE jobs SET status = 'pending', updated_at = ? WHERE status = 'running' AND updated_at < ?",
                (_now_iso(), cutoff)
            )
            count = cursor.rowcount
        if count:
            logger.warning("Recovered %s stale running jobs", count)
        return count
    except Exception as e:
        logger.error("Failed to recover stale jobs: %s", e)
        return 0
