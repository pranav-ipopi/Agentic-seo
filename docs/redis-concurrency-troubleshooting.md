# Redis Queue & Concurrency Troubleshooting Guide

This document captures the historical bottlenecks and architecture fixes implemented to achieve true, high-performance concurrency across multiple VPS workers using Redis. If the workers ever seem to "freeze", drop jobs, or process jobs too slowly despite high `MAX_CONCURRENT_SESSIONS` settings, refer to these documented resolutions.

## 1. The "Permanently Pending" Bug (Read-After-Write Race Condition)
**Symptom:**
When a user launches a new backlink campaign from the Next.js UI, the tasks would stay indefinitely stuck in a "pending" state. However, if the user clicked "Retry" on the task in the UI later, the worker would immediately pick it up and run it successfully.

**Root Cause:**
1. **Next.js Execution:** The backend inserted the jobs into Supabase and instantly pushed the job IDs to the Redis queue (`LPUSH`).
2. **Worker Polling:** The Python Playwright worker popped the job from Redis (`BLPOP`) in less than 10 milliseconds.
3. **The Race Condition:** The worker then queried Supabase to fetch the joined `workflow_templates` data based on the ID. Due to extremely slight database latency/replication lag (Read-After-Write), the row had not fully populated in the database.
4. **The Drop:** The worker got an empty result, logged a warning (`Job popped from Redis but not found in Supabase`), and discarded the job entirely. The job was erased from Redis but stuck as `pending` in Supabase forever.
5. **Why "Retry" Worked:** Retrying pushed the job back into Redis *after* the data had been sitting in Supabase for minutes, so the worker found it easily.

**The Fix:**
We refactored the architecture to be **Truly Redis-First**.
- The Next.js API (`execute/route.ts`) now pre-fetches the `workflow_template` and embeds it entirely inside the JSON payload *before* pushing it to Redis.
- The Python worker (`vps_worker_playwright.py`) now reads the full payload from Redis and completely bypasses querying Supabase upon job pickup. This eliminates the database race condition entirely and reduces database load.

## 2. The 30-Second "Staggering" Bottleneck (Queue Freezing)
**Symptom:**
Even with `MAX_CONCURRENT_SESSIONS=10`, the worker would only pull a new job from Redis every 30 seconds. Jobs were not executing simultaneously in a tightly packed burst.

**Root Cause:**
At the bottom of the main `while True` polling loop in the worker, the script used `asyncio.wait(active_tasks, return_when=asyncio.FIRST_COMPLETED, timeout=30)` whenever there was at least one active task running.
This caused the entire `poll_queue` loop to block and freeze. Even if the worker had 9 empty slots available, it would sit and wait for the currently running task to finish (or hit the 30s timeout) before it would loop back around to `pop_job()` from Redis.

**The Fix:**
The loop logic was restructured to check `remaining_slots = MAX_CONCURRENT_SESSIONS - len(active_tasks)`.
- If slots are available, it respects the short rate limiter delay and instantly loops back up to pop the next job without blocking.
- Only when `remaining_slots == 0` does it use `asyncio.wait` to freeze the queue until a browser slot opens up.

## 3. Artificial Global Rate Limiting
**Symptom:**
Jobs were intentionally delayed by 50 to 60 seconds.

**Root Cause:**
A legacy piece of code used `random.uniform(50, 60)` to update a `NEXT_JOB_ALLOWED_TIME_GLOBAL` variable, artificially staggering job execution to conserve resources.

**The Fix:**
Since the VPS machines are configured to handle concurrent browser loads, the artificial delay was drastically reduced to `random.uniform(2, 5)` seconds. This allows 10-12 concurrent Playwright instances to spawn within the first minute of a campaign launch, maximizing VPS throughput while still giving the system a tiny breather between heavy browser startups.
