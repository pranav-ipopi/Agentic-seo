# Implementation Plan: Backlink Worker Bugs

## Overview

Fixes 14 production bugs across `playwright_worker/` (Python) and `agentic-seo/` (Next.js). Tasks are grouped by theme and ordered so independent fixes can be worked in parallel (Tasks 1–7), followed by a unified test pass (Task 8) and regression verification (Task 9).

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1, 2, 3, 4, 5, 6, 7],
      "description": "Independent bug fixes — can be worked in parallel"
    },
    {
      "wave": 2,
      "tasks": [8],
      "description": "Write and run all unit, integration, and property-based tests"
    },
    {
      "wave": 3,
      "tasks": [9],
      "description": "Regression verification — confirm no existing behaviour broken"
    }
  ]
}
```

## Tasks

- [x] 1. Fix FIFO queue ordering: open `playwright_worker/services/queue_feeder.py` and change `lpush("backlink_queue", ...)` to `rpush("backlink_queue", ...)` in `feed_queue_from_supabase()` — this is the primary FIFO fix (bugfix.md §2.1)
- [x] 2. Fix FIFO fallback push: open `playwright_worker/vps_worker_playwright.py` and change the fallback `lpush('backlink_queue', ...)` (used when a job cannot be resolved in Supabase after 3 retries) to `rpush` so retry pushes also respect FIFO order (bugfix.md §2.1, §3.2)
- [x] 3. Scan `playwright_worker/` for any remaining `lpush` calls targeting `backlink_queue` and change them to `rpush`; confirm no other push sites exist
- [x] 4. Add pre-dispatch cancellation check: in `vps_worker_playwright.py` `poll_queue()`, after `redis_service.pop_job()` and before `asyncio.create_task(route_and_execute(...))`, query `supabase.table('tasks').select('status')` for the parent task_id; if `status == 'failed'` log and `continue` without spawning a coroutine (bugfix.md §2.3)
- [x] 5. Extend the cancellation check: also query `supabase.table('task_runs').select('status')` for the popped job's own `id`; if `status == 'cancelled'` log and `continue` without consuming a worker slot (bugfix.md §2.3)
- [x] 6. Confirm the existing in-flight cancellation logic (`task_mapping` + `t_task.cancel()` block) is completely preserved and untouched after the changes in Tasks 4–5
- [x] 7. Fix LRU worker selection: in `playwright_worker/methods/stealth_browser.py` `BrowserWorkerPool.get_idle_worker()`, add `worker.last_used = time.time()` immediately after `worker.state = WorkerState.BUSY` and before `return worker` so concurrent callers always see an up-to-date timestamp (bugfix.md §2.4)
- [x] 8. Fix about:blank crash recovery: in `BrowserWorker.get_page()`, after the `is_closed()` check, add a URL guard — if `self.page.url == 'about:blank'` then `await self.page.close()` and set `self.page = None`; wrap in try/except to absorb any stale-reference errors (bugfix.md §2.6)
- [x] 9. Fix TargetClosedError / externally closed tab: in `BrowserWorker.get_page()`, wrap the `self.page.is_closed()` call in `try/except Exception` that sets `self.page = None` on any exception, so a stale CDP reference does not propagate to the caller (bugfix.md §2.8)
- [x] 10. Add frozen-tab watchdog: in `BrowserWorker.execute_job()`, wrap `await job_coroutine_fn(page)` in `asyncio.wait_for(..., timeout=FROZEN_TAB_TIMEOUT)` where `FROZEN_TAB_TIMEOUT = int(os.environ.get('FROZEN_TAB_TIMEOUT_SECONDS', 600))`; on `asyncio.TimeoutError` call `page.reload(wait_until='commit')` then re-raise so the job enters the existing retry path (bugfix.md §2.5)
- [x] 11. Add new-tab fallback on consecutive timeouts: in `playwright_worker/templates/base_template.py` `safe_goto()`, in the `except PlaywrightTimeoutError` branch for the final attempt, call `await page.context.new_page()` before raising `ConnectionTimeoutError`; store the new page on the worker so the next `get_page()` call returns a clean tab (bugfix.md §2.7)
- [x] 12. Fix 5xx reload before retry: in `base_template.py` `safe_goto()`, inside the `elif response.status >= 500 and response.status != 520:` branch, add `await page.reload(wait_until="commit")` before `await asyncio.sleep(5)` on the non-final attempts; leave the 520 and 4xx paths completely unchanged (bugfix.md §2.12)
- [x] 13. Add email validation loop: in `base_template.py` `generate_natural_credentials()`, add module-level `import re` and `_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')`; replace the single `email = f"{username}@{domain}"` line with a loop of up to 3 attempts that regenerates username parts on each failure; raise `ValueError` if all 3 attempts produce an invalid email (bugfix.md §2.13)
- [x] 14. Fix new client default backlink_limit: in `agentic-seo/app/api/clients/route.ts` `POST` handler, read `const rawLimit = parseInt(process.env.DEFAULT_BACKLINK_LIMIT ?? '50', 10)` and add `backlink_limit: isNaN(rawLimit) ? 50 : rawLimit` to the Supabase `.insert()` payload (bugfix.md §2.14, §2.15)
- [x] 15. Document the new env var: add `DEFAULT_BACKLINK_LIMIT=50` to `agentic-seo/.env.local.example` with a comment explaining it is the per-client quota default for newly created clients
- [x] 16. Fix chat 502 silent failure: in `agentic-seo/components/chat/ChatWorkspace.tsx`, add `const [errorMessage, setErrorMessage] = useState<string | null>(null)`; call `setErrorMessage(null)` at the start of `handleSend`; in the non-abort `catch` branch set `setErrorMessage('Unable to reach the AI agent — check the Hermes service.')`; render an `aria role="alert"` div above the input when `errorMessage` is set (bugfix.md §2.18)
- [x] 17. Fix malformed SSE tool_progress chunk: in `agentic-seo/app/api/chat/route.ts` inside the `hermes.tool.progress` handler, add a guard `if (typeof parsed.tool !== 'object' || parsed.tool === null)` that calls `console.warn('[Chat API] Malformed tool_progress chunk — skipping:', ...)`, resets `prevEventType = ''`, and calls `continue` without emitting any chunk (bugfix.md §2.19)
- [x] 18. Write Python unit test for FIFO fix: create `playwright_worker/tests/test_queue_feeder.py`; mock `redis_service.client`; assert `rpush` is called (not `lpush`) for each task in `feed_queue_from_supabase()` (validates Property 1)
- [x] 19. Write Python unit test for LRU worker selection: in `playwright_worker/tests/test_worker_pool.py`, create 3 workers with staggered `last_used` values; call `get_idle_worker()` 6 times; assert round-robin distribution and that `last_used` is updated at selection (validates Property 3)
- [x] 20. Write Python unit test for about:blank recovery: mock `page.url = 'about:blank'`; call `get_page()`; assert `context.new_page()` is called once and the returned page is the new one (validates Property 4)
- [x] 21. Write Python unit test for TargetClosedError recovery: patch `page.is_closed()` to raise `Exception('Target closed')`; call `get_page()`; assert no exception propagates and a new page is returned (validates Property 5)
- [x] 22. Write Python unit test for 5xx reload: in `playwright_worker/tests/test_safe_goto.py`, mock `page.goto()` returning status 503 on attempt 0 and 200 on attempt 1; assert `page.reload(wait_until="commit")` is called before the second `page.goto()`; also assert it is NOT called for a 404 (validates Property 9)
- [x] 23. Write Python unit test for email validation: in `playwright_worker/tests/test_credentials.py`, run `generate_natural_credentials()` 500 times and assert all emails match `r'^[^@\s]+@[^@\s]+\.[^@\s]+$'`; patch `random.choice` to return `""` for first_names and assert `ValueError` is raised (validates Property 10)
- [x] 24. Write Python unit tests for OCR fuzzer: in `playwright_worker/tests/test_ocr_fuzzer.py`, test the FastAPI `/solve` endpoint — short token `"ab"` returns empty; score below 80 returns empty; out-of-dict match returns empty; `"drawa blank"` against dictionary entry `"draw a blank"` returns a score ≥ 80; valid match returns correctly (validates Properties 6, 7, 8)
- [x] 25. Write Python property-based test for credentials: in `playwright_worker/tests/test_credentials_pbt.py`, use `hypothesis` to generate random word-list entries (including edge cases like empty strings and strings with spaces) and assert the output email always matches the pattern or `ValueError` is raised (validates Property 10)
- [x] 26. Write Python property-based test for OCR: in `playwright_worker/tests/test_ocr_pbt.py`, use `hypothesis` to generate random OCR strings; assert that a result below threshold 80 or with length < 3 always returns `{"text": "", "score": 0.0}` (validates Properties 6, 7)
- [x] 27. Write TypeScript test for new client default limit: create `agentic-seo/__tests__/api/clients.test.ts`; mock Supabase service client; POST to `/api/clients`; assert `backlink_limit: 50` in the insert payload; also test env override `DEFAULT_BACKLINK_LIMIT=100` produces `backlink_limit: 100` (validates Property 11)
- [x] 28. Write TypeScript test for chat error visibility: create `agentic-seo/__tests__/components/ChatWorkspace.test.tsx`; mock `streamHermesChat` to yield `{ type: 'error', error: 'test 502' }`; render `ChatWorkspace`; assert an element with `role="alert"` containing "Unable to reach" is visible; also test success path shows no alert (validates Property 12)
- [x] 29. Write TypeScript test for malformed SSE chunk: create `agentic-seo/__tests__/api/chat-sse.test.ts`; simulate a `hermes.tool.progress` event with `data: {"status":"ok"}` (no `.tool` property); assert no `tool_progress` chunk is emitted and `console.warn` is called; then test a well-formed `{"tool":{"tool":"web_search","status":"started"}}` chunk is emitted correctly (validates Property 13)
- [x] 30. Regression: confirm a valid non-cancelled job dispatches to a worker and executes the full automation template; run the worker locally against a test Redis queue and verify end-to-end flow (regression 3.1)
- [x] 31. Regression: confirm a job that fails mid-execution is retried up to 3 times via `rpush` before being permanently failed; check `vps_worker_playwright.py` retry logic uses `rpush` (regression 3.2)
- [x] 32. Regression: with Redis disconnected, confirm the worker falls back to direct Supabase polling; inspect the `else:` branch in `poll_queue()` (regression 3.3)
- [x] 33. Regression: confirm `safe_goto()` with a 4xx (non-403) response retries with `page.goto()` only and does NOT call `page.reload()` (regression 3.8)
- [x] 34. Regression: call `GET /api/clients/[id]/quota` for an existing client with `backlink_limit = 100`; assert it returns `{ limit: 100 }` unchanged (regression 3.11)
- [x] 35. Regression: `PATCH /api/clients/[id]/limit` setting `backlink_limit` to `null` stores NULL and the quota endpoint returns `{ limit: null }` (regression 3.12)
- [x] 36. Regression: confirm a well-formed Hermes SSE stream delivers text deltas and tool progress to `ChatWorkspace` in real time with no errors (regression 3.14)
- [x] 37. Regression: confirm an OCR phrase matching the dictionary with `token_sort_ratio` ≥ 80 is returned without falling through to 2Captcha (regression 3.16)

## Notes

- Tasks 1–17 are independent and can be worked concurrently. No task in this group depends on another.
- The OCR fuzzer fixes (covering bugs 1.9, 1.10, 1.11, 1.18) are already implemented in `ocr_fuzzer.py`. Tasks 24–26 are verification tasks only — confirm the existing code satisfies the properties.
- `FROZEN_TAB_TIMEOUT_SECONDS` should be added to `playwright_worker/.env.example` with a default of `600` (10 minutes).
- The `page.reload()` in Task 12 uses `wait_until="commit"` (not `"load"`) to avoid timing out on slow sites — this matches the `wait_until` used in `page.goto()` throughout `safe_goto()`.
- For Task 11 (new-tab on consecutive timeouts), if `safe_goto` does not have a direct reference to the `BrowserWorker`, set `worker.page = new_page` via the `BrowserWorker` instance that owns the current page; the `get_page()` method will pick it up on the next call, bypassing the `about:blank` check added in Task 8.
- All TypeScript tests should use `jest` or `vitest` (whichever is already configured in `agentic-seo/`). Check `package.json` for the existing test runner before creating test files.
- All Python tests should use `pytest`. Install `hypothesis` for property-based tests: `pip install hypothesis`.
