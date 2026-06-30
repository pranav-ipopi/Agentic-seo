# Backlink Worker Bugs — Bugfix Design

## Overview

This document covers the technical design for fixing 14 production bugs across two subsystems:

1. **`playwright_worker/`** — the Python-based backlink automation orchestrator running 10 concurrent
   Chrome sessions on a remote windows beef pc in my own organization. Bugs span Redis queue ordering, worker load balancing, browser
   tab stability, OCR/captcha quality, and HTTP error handling.

2. **`agentic-seo/`** — the Next.js frontend. Bugs cover the client creation API (NULL
   `backlink_limit`) and the chat feature (silent 502 errors, malformed SSE chunk handling).

The fix strategy follows the bug condition methodology: for each bug we precisely define the
condition C(X) that triggers the defect, specify the property P(result) that the fixed code must
satisfy, and enumerate preservation requirements that must not regress.

Each fix is **minimal and targeted** — it touches only the lines directly responsible for the
defect, and does not restructure surrounding logic.


---

## Correctness Properties

The following properties must hold after all fixes are applied. They are expressed as executable invariants that a property-based test suite should verify.

### Property 1: FIFO Queue Ordering

**Validates: Requirements 2.1, 2.2**

For any sequence of N task_runs pushed by `queue_feeder.py`, a consumer using `blpop` MUST receive them in the exact insertion order. Formally: `consumed[i].created_at ≤ consumed[i+1].created_at` for all i. No job submitted earlier may be displaced by a job submitted later.

### Property 2: No Slot Consumed by Cancelled Job

**Validates: Requirements 2.3**

For any job popped from Redis, IF `tasks.status == 'failed'` OR `task_runs.status == 'cancelled'` THEN no worker slot is allocated and the job is silently discarded. The active_tasks set size MUST NOT increase for cancelled jobs.

### Property 3: LRU Worker Selection

**Validates: Requirements 2.4**

For any two idle workers W1 and W2, IF `W1.last_used < W2.last_used` THEN `get_idle_worker()` MUST return W1. `last_used` MUST be updated at the moment of selection, not deferred to `execute_job`.

### Property 4: Tab Recovery After about:blank

**Validates: Requirements 2.6**

For any page P where `page.url == "about:blank"` after a navigation attempt, `get_page()` MUST close P and return a freshly created page via `context.new_page()`. The new page's URL MUST NOT be `about:blank`.

### Property 5: Tab Recovery After External Close

**Validates: Requirements 2.8**

For any page P where `page.is_closed() == True` or where any operation raises `TargetClosedError`, `get_page()` MUST return a new page via `context.new_page()` without propagating the exception to the caller.

### Property 6: OCR Score Threshold

**Validates: Requirements 2.9, 2.10**

For any OCR result R, IF `len(R.text) < 3` OR `R.score < 80.0` THEN the fuzzer endpoint MUST return `{"text": "", "score": 0.0}`. No result below 80 or shorter than 3 characters MUST ever be returned as a non-empty match.

### Property 7: Dictionary Membership Guard

**Validates: Requirements 2.11, 2.21**

For any fuzzy match result M, IF `M.text NOT IN loaded_dictionary` THEN the endpoint MUST return `{"text": "", "score": 0.0}`. No out-of-dictionary phrase MUST ever be returned as a match.

### Property 8: token_sort_ratio Scorer

**Validates: Requirements 2.20**

For any OCR text T and dictionary phrase D, IF `fuzz.token_sort_ratio(T, D) >= 80` OR `fuzz.partial_ratio(T, D) >= 80` THEN the combined score MUST be `max(token_sort_ratio, partial_ratio)`. The legacy WRatio scorer MUST NOT be used.

### Property 9: 5xx Retry With Reload

**Validates: Requirements 2.12**

For any HTTP response with `status >= 500` (excluding 520) on attempt `i < max_retries - 1`, `page.reload(wait_until="commit")` MUST be called before the next `page.goto()` invocation.

### Property 10: Email Format Validity

**Validates: Requirements 2.13**

For any email string E produced by `generate_natural_credentials()`, `re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', E)` MUST be truthy. The function MUST raise `ValueError` if all 3 regeneration attempts produce invalid emails.

### Property 11: New Client Default Limit

**Validates: Requirements 2.14, 2.15**

For any `POST /api/clients` request, the inserted row MUST have `backlink_limit IS NOT NULL`. The value MUST equal `DEFAULT_BACKLINK_LIMIT` from environment (falling back to 50).

### Property 12: Chat Error Visibility

**Validates: Requirements 2.18**

For any non-2xx response from `/api/chat`, the React component MUST update an `errorMessage` state variable with a non-empty string, which MUST be rendered as visible text in the UI.

### Property 13: SSE Chunk Safety

**Validates: Requirements 2.19**

For any `hermes.tool.progress` SSE chunk, IF `parsed.tool` is not a non-null object THEN the chunk MUST be logged as a warning and silently skipped. No unhandled exception MUST propagate from the SSE loop.

---

## Glossary

- **Bug_Condition (C)**: The precise input state or code path that triggers a defect.
- **Property (P)**: The observable behaviour the fixed code must satisfy for all inputs where C holds.
- **Preservation**: Correct behaviours that must remain unchanged after each fix is applied.
- **FIFO**: First-In-First-Out queue ordering — tasks inserted earliest are consumed first.
- **LRU**: Least-Recently-Used — the worker with the oldest `last_used` timestamp.
- **blpop / lpush / rpush**: Redis queue primitives. `blpop` pops from the left; `lpush` pushes to
  the left (head); `rpush` pushes to the right (tail).
- **isBugCondition(input)**: Pseudocode predicate returning `true` when the bug manifests.
- **queue_feeder.py**: `playwright_worker/services/queue_feeder.py` — pushes `task_runs` to Redis.
- **vps_worker_playwright.py**: `playwright_worker/vps_worker_playwright.py` — main orchestrator loop.
- **BrowserWorkerPool / BrowserWorker**: `playwright_worker/methods/stealth_browser.py` — manages
  persistent Chrome sessions.
- **BaseTemplate / safe_goto**: `playwright_worker/templates/base_template.py` — base class with
  navigation and credential helpers.
- **ocr_fuzzer.py**: `playwright_worker/solvemedia_ocr/ocr_fuzzer.py` — FastAPI microservice that
  OCRs captcha images and fuzzy-matches against a phrase dictionary.
- **token_sort_ratio**: `rapidfuzz.fuzz.token_sort_ratio` — sorts tokens before comparing; robust to
  word-order and joined-word OCR noise.
- **WRatio**: Default `rapidfuzz` scorer; sensitive to character-level sequence differences.
- **POST /api/clients**: `agentic-seo/app/api/clients/route.ts` — creates a new client row.
- **streamHermesChat**: `agentic-seo/lib/hermes/client.ts` — async generator that streams SSE
  chunks from `/api/chat`.
- **ChatWorkspace**: `agentic-seo/components/chat/ChatWorkspace.tsx` — React component that owns
  the chat UI state and calls `streamHermesChat`.


---

## Bug Details

### Bug Group A — Queue / Fairness / Concurrency

#### A1: FIFO Queue Ordering (`lpush` → `rpush`)

**File:** `playwright_worker/services/queue_feeder.py`, line:
```python
await redis_service.client.lpush("backlink_queue", json.dumps(t))
```

The bug manifests unconditionally every time `feed_queue_from_supabase()` runs. Using `lpush`
inserts each task at the head of the list; since `pop_job()` in `redis_service.py` uses `blpop`
(which pops from the left), tasks inserted last are consumed first — strict LIFO/stack behaviour.

**Formal Specification:**
```
FUNCTION isBugCondition_A1(call)
  INPUT: call to feed_queue_from_supabase()
  OUTPUT: boolean
  RETURN any task is pushed via lpush to "backlink_queue"
END FUNCTION
```

**Examples:**
- User A submits 5 tasks at T=0; user B submits 5 tasks at T=1. With `lpush`, B's tasks are all
  at the head; A's tasks are never reached while B's batch is running → A starved indefinitely.
- With `rpush`, A's tasks stay at positions 1–5; B's go to positions 6–10; `blpop` consumes them
  in correct order 1→10.

#### A2: Cancelled Job Dispatch Without Pre-Check

**File:** `playwright_worker/vps_worker_playwright.py`, `poll_queue()` function — the block that
pops a job from Redis and immediately calls `asyncio.create_task(route_and_execute(...))` with no
prior status check against Supabase.

The bug condition is: a job whose parent `tasks` row has `status = 'failed'` (cancelled) is
popped from Redis and assigned to a worker slot before the worker discovers the cancellation.

**Formal Specification:**
```
FUNCTION isBugCondition_A2(job)
  INPUT: job dict popped from Redis
  OUTPUT: boolean
  parent_status := supabase.tasks.select('status').eq('id', job.state.task_id)
  run_status    := supabase.task_runs.select('status').eq('id', job.id)
  RETURN parent_status == 'failed' OR run_status == 'cancelled'
         AND worker_slot_was_consumed(job)
END FUNCTION
```

**Examples:**
- User clicks "Stop" in the UI → parent task marked `failed`. 3 remaining task_runs are already
  in Redis. Without the fix, all 3 are dispatched and run, burning 3 worker slots.
- With the fix, popped job is checked; if parent `status == 'failed'` the job is discarded without
  spawning a coroutine.

#### A3: Least-Recently-Used Worker Selection

**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorkerPool.get_idle_worker()`.

Current code already sorts by `last_used` ascending and picks the first element — this is
**already correct** in the source. The bug (1.4) describes a race condition where the pool can
return the same worker repeatedly if multiple coroutines call `get_idle_worker()` simultaneously
before `execute_job` updates `last_used`. The optimistic state lock (`worker.state = BUSY`) in
`get_idle_worker()` mitigates but does not fully eliminate this if `last_used` is only updated
inside `execute_job`. The fix requires updating `last_used` at the moment of checkout in
`get_idle_worker()` rather than deferring it to `execute_job`.

**Formal Specification:**
```
FUNCTION isBugCondition_A3(worker_selections)
  INPUT: sequence of N concurrent get_idle_worker() calls
  OUTPUT: boolean
  RETURN any worker appears more than ceil(N / pool_size) + 1 times
         in the returned sequence (indicating unfair skew)
END FUNCTION
```


### Bug Group B — Browser / Tab Stability

#### B1: Frozen Tab Detection and Reload (Bug 1.5)

**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorker.execute_job()`.

The `execute_job` method calls `page.goto(target_url)` with a 30-second timeout, then awaits the
`job_coroutine_fn`. If the page freezes mid-job (no JS progress, no navigation), the worker stays
in `WorkerState.BUSY` until the pool's health monitor forcibly restarts it after 15 minutes.
There is no intermediate watchdog or reload attempt.

**Formal Specification:**
```
FUNCTION isBugCondition_B1(worker)
  INPUT: BrowserWorker instance
  OUTPUT: boolean
  RETURN worker.state == BUSY
         AND (time.time() - worker.last_used) > FROZEN_TAB_TIMEOUT
         AND page has not navigated or produced a network event recently
END FUNCTION
```

**Examples:**
- Site loads a spinner indefinitely. Worker stuck for 15 min until pool forcibly restarts. Fix:
  detect no-progress within configurable window (e.g., 5 min), call `page.reload()`, retry once.

#### B2: `about:blank` Crash Recovery (Bug 1.6)

**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorker.get_page()`.

`get_page()` checks `page.is_closed()` and reopens if so, but does **not** check
`page.url == "about:blank"` after a navigation attempt. A Chrome tab crash typically shows
`about:blank` rather than raising an exception, leaving the page object alive but dead.

**Formal Specification:**
```
FUNCTION isBugCondition_B2(page)
  INPUT: Playwright Page object after navigation
  OUTPUT: boolean
  RETURN page.url == "about:blank"
         AND navigation was previously attempted (not the initial warm-up goto)
END FUNCTION
```

#### B3: Consecutive Timeout → New Tab (Bug 1.7)

**File:** `playwright_worker/templates/base_template.py`, `safe_goto()`.

When all `max_retries` of `page.goto()` raise `PlaywrightTimeoutError`, `safe_goto` raises
`ConnectionTimeoutError`. The tab itself is not replaced; the next retry (if any) reuses the same
stuck page object. The fix: on the final timeout retry, call `context.new_page()` to open a fresh
tab before raising the error, so the calling code can optionally retry with a clean context.

**Formal Specification:**
```
FUNCTION isBugCondition_B3(page, url, attempts)
  INPUT: Playwright Page, URL string, consecutive timeout count
  OUTPUT: boolean
  RETURN all(attempt raised PlaywrightTimeoutError for attempt in attempts)
         AND page is still the original stuck page object
END FUNCTION
```

#### B4: Externally Closed Tab Recovery (Bug 1.8)

**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorker.get_page()`.

`get_page()` checks `self.page.is_closed()` but does **not** catch `TargetClosedError` which
Playwright raises when the CDP target is gone (e.g., tab manually closed). The fix adds a
`try/except TargetClosedError` block that calls `context.new_page()`.

**Formal Specification:**
```
FUNCTION isBugCondition_B4(page)
  INPUT: Playwright Page object
  OUTPUT: boolean
  RETURN page.is_closed() == True OR raises TargetClosedError on any operation
END FUNCTION
```


### Bug Group C — OCR / SolveMedia Captcha

#### C1: Minimum Score Threshold (Bugs 1.9, 1.10, 1.11)

**File:** `playwright_worker/solvemedia_ocr/ocr_fuzzer.py`.

> **Note:** Reviewing the current source, the `ocr_fuzzer.py` file already contains the fixes for
> bugs 1.9, 1.10, and 1.11 — the short-token rejection (`len(detected_text) < 3`), the 80-point
> threshold (`MIN_SCORE = 80.0`), and the dictionary membership guard. These were applied in a
> prior fix pass. The tasks.md for this spec should treat these as verification tasks (confirm the
> fixes are correct and tested) rather than fresh implementation tasks.

The bug conditions that the existing code now guards against:

```
FUNCTION isBugCondition_C1_shorttoken(ocr_text)
  INPUT: raw OCR string
  OUTPUT: boolean
  RETURN len(ocr_text) < 3    -- fragment like "i", "do" would previously pass through
END FUNCTION

FUNCTION isBugCondition_C1_lowscore(match_score)
  INPUT: float fuzzy score 0–100
  OUTPUT: boolean
  RETURN match_score < 80.0   -- previously any score was accepted
END FUNCTION

FUNCTION isBugCondition_C1_outofdict(best_match, dictionary)
  INPUT: matched string, loaded phrase list
  OUTPUT: boolean
  RETURN best_match NOT IN dictionary  -- theoretical edge case
END FUNCTION
```

#### C2: Improved Scorer — token_sort_ratio + partial_ratio (Bug 1.18)

**File:** `playwright_worker/solvemedia_ocr/ocr_fuzzer.py`, `_best_score()` function.

> **Note:** The current source already implements `_best_score()` using `max(fuzz.token_sort_ratio,
> fuzz.partial_ratio)` and the loop that calls it for every phrase. This replaces the original
> single `process.extractOne()` call that used WRatio. These fixes are applied. Verification
> tasks should confirm the scorer logic is correct and the combined-scorer approach is tested.

**Why this matters:** WRatio compares character sequences globally; a single joined-word OCR artefact
like `"drawa blank"` vs `"draw a blank"` scores ~82 with WRatio but ~95 with `token_sort_ratio`
because the latter sorts tokens alphabetically before comparing. `partial_ratio` handles cases where
a word was dropped entirely (e.g., `"draw blank"` → `"draw a blank"` scores ~95).

```
FUNCTION isBugCondition_C2(ocr_text, correct_phrase)
  INPUT: OCR output string, expected dictionary phrase
  OUTPUT: boolean
  RETURN fuzz.WRatio(ocr_text, correct_phrase) < 80
         AND the phrase IS in the dictionary
         AND the OCR text is a recognisably close read of that phrase
END FUNCTION
```

**Example:** `"drawa blank"` → WRatio gives ~82 (near threshold, risky); `token_sort_ratio` gives
~95; `partial_ratio` gives ~94. Combined `max()` → 95, safely above threshold.


### Bug Group D — Safe Navigation / 5xx Handling

#### D1: Missing `page.reload()` Before 5xx Retry (Bug 1.12)

**File:** `playwright_worker/templates/base_template.py`, `safe_goto()`, 5xx branch:

```python
elif response.status >= 500 and response.status != 520:
    self.logger.warning(...)
    if attempt < max_retries - 1:
        await asyncio.sleep(5)
        continue          # ← loops back to page.goto() without a reload
```

Without an explicit `page.reload()`, Chromium may serve the cached 5xx error page on the next
`page.goto()` call (particularly `ERR_HTTP_RESPONSE_CODE_FAILURE` pages that get cached in the
browser process memory). The fix calls `await page.reload(wait_until="commit")` before `continue`.

**Formal Specification:**
```
FUNCTION isBugCondition_D1(response, attempt, max_retries)
  INPUT: HTTP response object, attempt index, max retries
  OUTPUT: boolean
  RETURN response.status >= 500
         AND response.status != 520
         AND attempt < max_retries - 1
         AND page.reload() was NOT called before the next page.goto()
END FUNCTION
```

**Examples:**
- `GET https://example-pligg.com/submit` → 503. Without reload, second attempt hits browser cache
  and returns 503 again instantly. With reload, the browser discards cache and fetches fresh.
- 520 (Cloudflare unknown) is excluded because `handle_cloudflare_challenge` manages that path.

### Bug Group E — Invalid Email Generation

#### E1: Missing Email Validation in Credential Generation (Bug 1.13)

**File:** `playwright_worker/templates/base_template.py`, `generate_natural_credentials()`.

The current implementation always builds `email = f"{username}@{domain}"` where `username` is
composed of non-empty list entries and `domain` is chosen from a hardcoded list — so in practice
the email is always valid with the current word lists. However, the requirement mandates a runtime
validation guard because future maintenance (adding edge-case names, empty strings, Unicode) could
silently break it.

**Formal Specification:**
```
FUNCTION isBugCondition_E1(generated_email)
  INPUT: email string output from generate_natural_credentials()
  OUTPUT: boolean
  EMAIL_PATTERN = r'^[^@\s]+@[^@\s]+\.[^@\s]+$'
  RETURN NOT re.match(EMAIL_PATTERN, generated_email)
END FUNCTION
```

**Fix approach:** After assembling the email string, validate against `r'^[^@\s]+@[^@\s]+\.[^@\s]+$'`;
regenerate up to 3 times; raise `ValueError` if all attempts fail.


### Bug Group F — New Client Default Limit

#### F1: NULL `backlink_limit` on Client Creation (Bug 1.14)

**File:** `agentic-seo/app/api/clients/route.ts`, `POST` handler.

Current insert:
```typescript
.insert({ name, domain, description, category, created_by: user.id })
```

`backlink_limit` is omitted. The Postgres column defaults to `NULL` (see `supabase_scheme.txt`:
`backlink_limit integer` — no DEFAULT clause). The quota endpoint then returns
`{ limit: null, remaining: null }`.

**Formal Specification:**
```
FUNCTION isBugCondition_F1(insertPayload)
  INPUT: object passed to supabase .insert() in POST /api/clients
  OUTPUT: boolean
  RETURN 'backlink_limit' NOT IN insertPayload
         OR insertPayload.backlink_limit === null
END FUNCTION
```

**Fix approach:**
1. Read `DEFAULT_BACKLINK_LIMIT` from `process.env` (fallback `50`).
2. Optionally query a `settings` table for `key = 'default_backlink_limit'`.
3. Include `backlink_limit: defaultLimit` in the insert payload.

### Bug Group G — Chat Feature

#### G1: Silent 502 in Chat UI (Bug 1.16)

**File:** `agentic-seo/components/chat/ChatWorkspace.tsx`, `handleSend()`.

In `streamHermesChat` (`lib/hermes/client.ts`), when `/api/chat` returns a non-2xx status, it
already yields `{ type: 'error', error: ... }`. In `ChatWorkspace.tsx`, the `for await` loop does:

```typescript
if (chunk.type === 'error') {
  throw new Error(chunk.error ?? 'Unknown error from Hermes')
}
```

This throw is caught by the outer `catch (err: any)` block which only does `console.error('Chat error:', err)` — **no visible UI feedback**. The user sees the input silently freeze.

**Formal Specification:**
```
FUNCTION isBugCondition_G1(apiResponse, uiState)
  INPUT: HTTP response from /api/chat, React component state
  OUTPUT: boolean
  RETURN apiResponse.status >= 400
         AND uiState.errorMessage === undefined   -- no error surfaced
         AND uiState.isStreaming === false         -- streaming stopped silently
END FUNCTION
```

#### G2: Malformed SSE `tool_progress` Chunk (Bug 1.17)

**File:** `agentic-seo/app/api/chat/route.ts`, SSE transform stream.

The `hermes.tool.progress` handler:
```typescript
if (prevEventType === 'hermes.tool.progress' || parsed.tool) {
  const chunk = JSON.stringify({
    type: 'tool_progress',
    tool: typeof parsed.tool === 'object' && parsed.tool !== null ? parsed.tool : parsed,
  })
```

If `prevEventType` was set to `hermes.tool.progress` but `parsed` is `{ status: 'ok' }` (no
`.tool` property), the code falls through to `tool: parsed` — which is a non-tool object. The
`ChatWorkspace` `tool_progress` handler then tries to read `toolData.tool` from a plain object,
producing undefined tool names. Additionally, if the payload is completely malformed (not a JSON
object), the outer `catch {}` silently drops it with no log.

**Formal Specification:**
```
FUNCTION isBugCondition_G2(sseChunk)
  INPUT: parsed SSE data object from Hermes
  OUTPUT: boolean
  RETURN prevEventType === 'hermes.tool.progress'
         AND (sseChunk.tool === undefined OR typeof sseChunk.tool !== 'object')
END FUNCTION
```


---

## Expected Behavior

### Preservation Requirements

The following behaviours must be **completely unchanged** after all fixes are applied:

**Queue / Orchestration**
- A valid, non-cancelled job popped from Redis must continue to be dispatched to a worker and
  execute the full automation template (requirement 3.1).
- A job that fails mid-execution must continue to be retried up to 3 total attempts via `rpush`
  to the queue tail before being permanently failed (requirement 3.2).
- When Redis is unavailable, the worker must continue to fall back to direct Supabase polling
  (requirement 3.3).

**Browser / Tab**
- When a tab loads successfully, the same tab must be reused for all subsequent steps in that
  job execution (requirement 3.4).
- When the CDP connection is lost, `worker.restart()` must continue to be called to fully
  reconnect before retrying (requirement 3.5).

**OCR / Captcha**
- A valid phrase present in the dictionary with a combined score ≥ 80 must continue to be
  returned as the captcha answer (requirement 3.6).
- When the OCR service fails or the dictionary file is missing, the service must continue to
  return `{"text": "", "score": 0.0}` (requirement 3.7).

**Safe Navigation**
- 4xx responses (except 403) must continue to be retried with `page.goto()` without an extra
  reload (requirement 3.8).
- After all retries are exhausted, `SiteDownError` must continue to be raised (requirement 3.9).

**Credential Generation**
- When `generate_natural_credentials()` produces a valid email on the first attempt, the full
  credentials dict must be returned unchanged (requirement 3.10).

**Client Quota**
- An existing client that already has a non-null `backlink_limit` must continue to return that
  value from `GET /api/clients/[id]/quota` (requirement 3.11).
- `PATCH /api/clients/[id]/limit` setting `backlink_limit` to `null` must continue to store
  NULL and treat the client as having no cap (requirement 3.12).

**Chat**
- When Hermes is reachable and returns a well-formed SSE stream, text deltas and tool progress
  events must continue to be streamed in real time (requirement 3.14).
- When the user clicks "Stop", `AbortController.abort()` must continue to cancel the fetch and
  save accumulated content (requirement 3.15).


---

## Hypothesized Root Cause

### A1 — FIFO Ordering
`lpush` was almost certainly a typo or copy-paste error. Redis `lpush` and `rpush` share the same
signature. Since `blpop` pops from the left, `lpush` creates a stack; `rpush` creates a queue.
The developer likely intended FIFO but used the wrong direction.

### A2 — Cancelled Job Pre-Check
The pre-check for cancelled tasks exists in the `poll_queue` loop via `res_cancelled` (checking
`tasks.status == 'failed'`), but it only cancels **in-flight** asyncio tasks via
`t_task.cancel()`. Jobs **already in the Redis queue** at the time of cancellation are not
removed from Redis; they are simply popped and immediately dispatched without a status check.
The root cause is the missing Supabase lookup between `pop_job()` and `asyncio.create_task()`.

### A3 — Worker Load Skew
`get_idle_worker()` sets `worker.state = BUSY` optimistically before returning. If two coroutines
call `get_idle_worker()` in rapid succession, the second call correctly sees the first worker as
BUSY. The real issue is that `last_used` is only updated inside `execute_job` (after the lock is
already released), so under concurrent burst arrivals, multiple calls may see the same
`last_used` snapshot and pick workers sub-optimally. The fix is to update `last_used = time.time()`
inside `get_idle_worker()` at the point of selection.

### B1 — Frozen Tab
The `execute_job` method provides a 30-second timeout for `page.goto()`, but the subsequent
`job_coroutine_fn(page)` has no overall deadline. A hang inside the template (e.g., waiting for
a selector that never appears without timing out) keeps the worker in `BUSY` indefinitely. The
pool health monitor only triggers at 15 minutes and does a full restart rather than a page reload.

### B2 — about:blank Crash
Chromium represents a crashed/killed tab as `about:blank` with the page object remaining valid
(no exception). The `is_closed()` check returns `False`, so `get_page()` returns the broken
page. The root cause is missing URL validation after navigation.

### B3 — Consecutive Timeout
`safe_goto` correctly implements exponential backoff retries, but on the final retry it raises
`ConnectionTimeoutError` with the existing (potentially stuck) page. Upstream callers in
`vps_worker_playwright.py` then receive the exception and mark the job failed. A fresh tab is
never attempted within `safe_goto` itself.

### B4 — External Tab Close
Playwright raises `TargetClosedError` (a subclass of `Error`) when you call any method on a page
whose CDP target has been removed. `get_page()` guards against `is_closed()` returning True but
does not have a `try/except` around the check itself — if the page reference is stale enough,
even `page.is_closed()` may raise `TargetClosedError`.

### D1 — 5xx Retry Without Reload
The retry loop calls `continue` after `asyncio.sleep(5)`, which jumps back to `page.goto(url)`.
The Playwright browser process may still have the 5xx error page in its navigation stack. An
explicit `page.reload()` forces a true HTTP re-fetch, discarding any cached state.

### E1 — Email Validation
The `generate_natural_credentials` function constructs the email via f-string interpolation with
no validation. The current word lists always produce valid emails, but there is no defensive
check. If a contributor adds an entry with a space or special character to `first_names` or
`last_names`, downstream registration failures would be silent and hard to trace.

### F1 — NULL backlink_limit
`POST /api/clients` performs a minimal insert of only the fields supplied by the client form
(`name`, `domain`, `description`, `category`). The `backlink_limit` column has no DEFAULT in
Postgres, so omitting it leaves NULL. The quota API then returns `{limit: null, remaining: null}`
and the UI renders "unlimited", which is not the intended default behaviour.

### G1 — Silent Chat 502
The error path in `ChatWorkspace.handleSend` catches the thrown error but only calls
`console.error`. There is no `useState` for an error message, no toast, and no UI indicator.
The user sees `isStreaming` reset to `false` and the input re-enabled, with no explanation.

### G2 — Malformed SSE Tool Progress
The SSE handler uses a shared `prevEventType` string. When the event type is
`hermes.tool.progress` but the corresponding data line contains a payload without a `.tool`
key (e.g., a status/heartbeat message from Hermes), the code falls through to
`tool: parsed` — wrapping the entire payload as the tool object. In `ChatWorkspace`, this hits
the `toolData.tool` property access and produces `undefined`, silently showing nothing.



---

## Fix Implementation

Each fix is minimal and targeted. Only the lines directly responsible for each defect are changed.

### Fix A1 — FIFO Queue Ordering
**File:** `playwright_worker/services/queue_feeder.py`
**Change:** Replace `lpush` with `rpush` in `feed_queue_from_supabase()`.
```python
# Before
await redis_service.client.lpush("backlink_queue", json.dumps(t))
# After
await redis_service.client.rpush("backlink_queue", json.dumps(t))
```
Also fix the fallback `lpush` call in `vps_worker_playwright.py` (line: `await redis_service.client.lpush('backlink_queue', json.dumps(job))`) — this fallback push should also use `rpush`.

### Fix A2 — Pre-Dispatch Cancellation Check
**File:** `playwright_worker/vps_worker_playwright.py`, `poll_queue()` function.
**Change:** After popping a job from Redis and before `asyncio.create_task(...)`, add a Supabase status check:
```python
# Check parent task and run status before dispatching
task_id = (job.get('state') or {}).get('task_id')
if task_id:
    parent_res = supabase.table('tasks').select('status').eq('id', task_id).single().execute()
    if parent_res.data and parent_res.data.get('status') == 'failed':
        logger.info(f"Job {job.get('id')} discarded — parent task is failed/cancelled.")
        continue
run_res = supabase.table('task_runs').select('status').eq('id', job.get('id')).single().execute()
if run_res.data and run_res.data.get('status') == 'cancelled':
    logger.info(f"Job {job.get('id')} discarded — task_run is cancelled.")
    continue
```

### Fix A3 — LRU Worker last_used Update
**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorkerPool.get_idle_worker()`.
**Change:** Update `worker.last_used` at the moment of selection:
```python
worker = idle_workers[0]
worker.state = WorkerState.BUSY
worker.last_used = time.time()  # ← add this line
return worker
```

### Fix B1 — Frozen Tab Detection
**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorker.execute_job()`.
**Change:** Add a configurable frozen-tab watchdog. Before awaiting `job_coroutine_fn(page)`, record a progress timestamp and check it periodically, or wrap the coroutine in `asyncio.wait_for` with a maximum duration. When the timeout fires, call `page.reload()` and retry once before raising.

### Fix B2 — about:blank Crash Recovery
**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorker.get_page()`.
**Change:** After the `is_closed()` check, add a URL check:
```python
if self.page and not self.page.is_closed():
    try:
        if self.page.url == 'about:blank':
            await self.page.close()
            self.page = None
    except Exception:
        self.page = None
```

### Fix B3 — Consecutive Timeout → New Tab
**File:** `playwright_worker/templates/base_template.py`, `safe_goto()`, final timeout retry.
**Change:** On the final `PlaywrightTimeoutError` attempt, open a new tab before raising:
```python
except PlaywrightTimeoutError as e:
    if attempt < max_retries - 1:
        ...
    else:
        # Open a fresh tab so the caller can retry with a clean context
        try:
            context = page.context
            self.page = await context.new_page()
        except Exception:
            pass
        raise ConnectionTimeoutError(...) from e
```
Note: The new page reference must be propagated back to the caller. In practice the `BrowserWorker.page` attribute should be updated so the next `get_page()` returns the fresh tab.

### Fix B4 — Externally Closed Tab Recovery
**File:** `playwright_worker/methods/stealth_browser.py`, `BrowserWorker.get_page()`.
**Change:** Wrap the closed-page check in a `try/except`:
```python
try:
    if self.page and self.page.is_closed():
        self.page = None
except Exception:  # TargetClosedError or similar
    self.page = None
    
if self.page is None:
    context = self.browser.contexts[0]
    self.page = await context.new_page()
    ...
```

### Fix C1/C2 — OCR Scorer (Already Applied)
**File:** `playwright_worker/solvemedia_ocr/ocr_fuzzer.py`
**Status:** The `_best_score()` function using `max(fuzz.token_sort_ratio, fuzz.partial_ratio)`, the `MIN_SCORE = 80.0` threshold, the `len(detected_text) < 3` rejection, and the dictionary membership guard are all already in place. This fix requires only verification tests.

### Fix D1 — 5xx Reload Before Retry
**File:** `playwright_worker/templates/base_template.py`, `safe_goto()`, 5xx branch.
**Change:** Add `page.reload()` before `continue`:
```python
elif response.status >= 500 and response.status != 520:
    self.logger.warning(f"Server error {response.status} from {url}. Retrying...")
    if attempt < max_retries - 1:
        await page.reload(wait_until="commit")   # ← add this line
        await asyncio.sleep(5)
        continue
```

### Fix E1 — Email Validation
**File:** `playwright_worker/templates/base_template.py`, `generate_natural_credentials()`.
**Change:** After building the `email` string, add validation and regeneration loop:
```python
import re
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

for _attempt in range(3):
    email = f"{username}@{domain}"
    if _EMAIL_RE.match(email):
        break
    # Regenerate username components
    first = random.choice(first_names)
    last = random.choice(last_names)
    username = f"{first}{last}{random.randint(10, 99999)}"
else:
    raise ValueError(f"Could not generate a valid email after 3 attempts")
```

### Fix F1 — New Client Default Limit
**File:** `agentic-seo/app/api/clients/route.ts`, `POST` handler.
**Change:** Read the default limit and include it in the insert:
```typescript
const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_BACKLINK_LIMIT ?? '50', 10)
const defaultLimit = isNaN(DEFAULT_LIMIT) ? 50 : DEFAULT_LIMIT

const { data, error: clientError } = await supabaseAdmin
  .from('clients')
  .insert({ name, domain, description, category, created_by: user.id, backlink_limit: defaultLimit } as any)
  .select()
  .single()
```

### Fix G1 — Chat 502 Error Visibility
**File:** `agentic-seo/components/chat/ChatWorkspace.tsx`, `handleSend()`.
**Change:**
1. Add `const [errorMessage, setErrorMessage] = useState<string | null>(null)` to state.
2. In the `catch` block, replace `console.error('Chat error:', err)` with:
   ```typescript
   setErrorMessage('Unable to reach the AI agent — check the Hermes service.')
   ```
3. Render the error message in the JSX:
   ```tsx
   {errorMessage && (
     <div className="px-4 py-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md mx-4 mb-2">
       {errorMessage}
     </div>
   )}
   ```
4. Clear `errorMessage` at the start of `handleSend`.

### Fix G2 — Malformed SSE Tool Progress
**File:** `agentic-seo/app/api/chat/route.ts`, SSE transform stream, `hermes.tool.progress` handler.
**Change:** Add a guard that only emits the chunk if `parsed.tool` is a non-null object:
```typescript
if (prevEventType === 'hermes.tool.progress' || parsed.tool) {
  if (typeof parsed.tool !== 'object' || parsed.tool === null) {
    console.warn('[Chat API] Malformed tool_progress chunk — skipping:', parsed)
    prevEventType = ''
    continue
  }
  const chunk = JSON.stringify({
    type: 'tool_progress',
    tool: parsed.tool,
  })
  safeEnqueue(encoder.encode(`data: ${chunk}\n\n`))
  prevEventType = ''
  continue
}
```

---

## Testing Strategy

Tests are grouped by subsystem. All tests must pass without modifying correct existing behaviour (regression prevention clauses 3.x).

### Python Worker Tests (`playwright_worker/tests/`)

**Queue / Concurrency**
- `test_queue_feeder_rpush`: Mock Redis client; assert `rpush` is called (not `lpush`) for each task_run.
- `test_fifo_order`: Push 5 items via `feed_queue_from_supabase()` and pop them via `blpop`; assert order matches `created_at` ascending.
- `test_cancelled_job_discarded`: Stub Supabase to return `status='failed'` for a parent task; assert `asyncio.create_task` is never called for that job.
- `test_lru_worker_selection`: Create 3 workers with different `last_used` values; call `get_idle_worker()` twice concurrently; assert first call returns the oldest-`last_used` worker and that worker's `last_used` is updated immediately.

**Browser Stability**
- `test_about_blank_recovery`: Set `worker.page.url = "about:blank"` on a mock page; call `get_page()`; assert a new page is created via `context.new_page()`.
- `test_closed_tab_recovery`: Set `page.is_closed()` to return True; call `get_page()`; assert recovery without exception.
- `test_target_closed_error_recovery`: Patch `page.is_closed()` to raise `TargetClosedError`; call `get_page()`; assert a new page is returned.

**OCR Fuzzer**
- `test_short_token_rejection`: POST a captcha image whose OCR result is `"ab"`; assert response is `{"text": "", "score": 0.0}`.
- `test_low_score_rejection`: Mock `_best_score` to return 75; assert response is `{"text": "", "score": 0.0}`.
- `test_out_of_dict_rejection`: Return a match not present in the dictionary; assert response is `{"text": "", "score": 0.0}`.
- `test_token_sort_ratio_used`: Mock `fuzz.WRatio` and `fuzz.token_sort_ratio`; assert `token_sort_ratio` is called and `WRatio` is not.
- `test_joined_word_scores_correctly`: Pass `"drawa blank"` against dictionary containing `"draw a blank"`; assert score ≥ 80 and match returned.

**Safe Navigation**
- `test_5xx_triggers_reload`: Mock `page.goto()` to return status 503 on first attempt; assert `page.reload(wait_until="commit")` is called before the second `page.goto()`.
- `test_4xx_no_reload`: Mock `page.goto()` to return status 404; assert `page.reload()` is NOT called.

**Credential Generation**
- `test_valid_email_always_returned`: Run `generate_natural_credentials()` 1000 times; assert all emails match `r'^[^@\s]+@[^@\s]+\.[^@\s]+$'`.
- `test_invalid_email_raises_value_error`: Patch `random.choice` to return an empty string for `first_names`; assert `ValueError` is raised after 3 attempts.

### TypeScript / Next.js Tests (`agentic-seo/__tests__/`)

**Client API**
- `test_post_clients_sets_default_limit`: Mock `supabaseAdmin.from('clients').insert`; call `POST /api/clients`; assert `backlink_limit` in the insert payload equals `DEFAULT_BACKLINK_LIMIT` env var or 50.
- `test_env_override`: Set `DEFAULT_BACKLINK_LIMIT=100`; assert `backlink_limit: 100` in the insert.

**Chat UI**
- `test_chat_error_message_visible`: Render `ChatWorkspace`; mock `streamHermesChat` to yield `{ type: 'error', error: 'test' }`; assert an element with text "Unable to reach" is rendered.
- `test_no_error_on_success`: Mock a successful stream; assert no error message element is present.

**Chat API Route**
- `test_malformed_tool_progress_skipped`: Send an SSE chunk with `prevEventType='hermes.tool.progress'` but `parsed = { status: 'ok' }` (no `.tool`); assert no `tool_progress` chunk is emitted and a `console.warn` is triggered.
- `test_well_formed_tool_progress_emitted`: Send a chunk with `parsed.tool = { tool: 'web_search', status: 'started' }`; assert a `tool_progress` chunk is emitted with the correct shape.

### Property-Based Tests

Use `hypothesis` (Python) and `fast-check` (TypeScript) to verify correctness properties P1–P13 against generated inputs:
- P1: Randomise `N` task_runs with random `created_at` offsets; verify pop order.
- P6/P7: Generate random OCR strings; verify threshold and dict-membership invariants hold for all inputs.
- P10: Generate 10 000 credential sets; assert all emails match the pattern.
- P11: Generate random env values for `DEFAULT_BACKLINK_LIMIT`; assert insert payload always contains a non-null integer.
