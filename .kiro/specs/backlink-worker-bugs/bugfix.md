# Bugfix Requirements Document

## Introduction

This document covers 14 production bugs identified in the `playwright_worker/` backlink automation
system and the `agentic-seo/` Next.js frontend. The worker runs on a remote PC with a concurrency
of 10 Chrome sessions. Bugs are grouped thematically and prioritised by severity:
**Critical** (data loss / total failure), **High** (reliability / fairness), and **Medium** (quality
/ correctness). Clause numbers follow the X.Y format throughout.

---

## Bug Analysis

### Current Behavior (Defect)

**Queue / Fairness / Concurrency (Critical)**

1.1 WHEN `queue_feeder.py` pushes task runs to Redis THEN the system uses `lpush`, which adds each
task to the front/left of `backlink_queue`, so tasks submitted later displace tasks submitted
earlier and violate FIFO ordering.

1.2 WHEN user A starts a backlink job and user B subsequently starts a different job THEN the system
keeps picking tasks from user B's newer batch first, starving user A's older tasks indefinitely.

1.3 WHEN a cancelled or stopped job remains in the Redis queue THEN the system pops and begins
executing it, then logs "cancelled — not doing it" only after occupying a worker slot, wasting
concurrency capacity.

1.4 WHEN multiple workers are available THEN the system sometimes routes all new tasks to the same
one or two worker sessions, leaving other Chrome sessions idle and underutilised.

**Browser / Tab Stability (Critical)**

1.5 WHEN a Chrome tab becomes unresponsive during automation THEN the system does not detect the
frozen state and does not attempt a page refresh, leaving the worker stuck on that tab indefinitely.

1.6 WHEN a Chrome tab crashes and shows `about:blank` THEN the system does not detect the crash URL
and does not recover; if two tabs crash simultaneously both are left in the dead state.

1.7 WHEN a target site is completely unresponsive (repeated timeouts / blank page) THEN the system
does not open a new Chrome tab to navigate in a fresh context — it retries on the same stuck tab.

1.8 WHEN a Chrome tab is externally closed (e.g., manually by the user during testing) THEN the
system does not detect the closure and does not reopen or recover that tab.

**OCR / SolveMedia Captcha (High)**

1.9 WHEN `process.extractOne()` is called with a short OCR result such as `"don"` or `"i"` THEN
the system returns it with a high confidence score (~90) regardless of whether it is a meaningful
match, because `extractOne` always returns the closest entry with no minimum threshold.

1.10 WHEN the OCR produces a token shorter than 3 characters THEN the system does not reject it
outright and passes it upstream with a potentially high-but-meaningless score, causing false-positive
captcha submissions.

1.11 WHEN the fuzzy-matched word is not actually present in `solvemedia.txt` THEN the system does
not verify dictionary membership and accepts the result anyway.

1.18 WHEN EasyOCR reads a captcha phrase that exists in `solvemedia.txt` but the OCR output has
minor character-level noise (e.g., a joined word like `"drawa blank"` instead of `"draw a blank"`,
a dropped character, or a slight OCR misread of one letter) THEN the default WRatio scorer in
`process.extractOne()` penalises these small character differences with a disproportionate score
drop — producing scores in the 75–85 range for what is effectively a correct read of a real
dictionary phrase. The image crop already removes the "Enter the following:" header, so noise
from that source is not the problem. The actual issue is that WRatio compares character sequences
globally, so a single dropped space or misread letter in a 3-word phrase can drop the score from
100 to ~78, causing unnecessary captcha refreshes and wasted 2Captcha fallback credits.

**Safe Navigation / 5xx Handling (High)**

1.12 WHEN `safe_goto()` receives a 5xx HTTP response THEN the system retries by calling
`page.goto()` again but does not issue an explicit `page.reload()` first, so the browser may
return the same cached error page on retry.

**Invalid Email Generation (High)**

1.13 WHEN `generate_natural_credentials()` constructs an email address THEN the system does not
validate the resulting string; under certain edge-case combinations it can produce an address
without `@` or with a malformed format, which causes downstream registration failures.

**New Client Default Limit (Medium)**

1.14 WHEN a new client is created via `POST /api/clients` THEN the system inserts the record with
`backlink_limit = NULL`, causing the quota endpoint to return `{"limit": null, "remaining": null}`
and the UI to display "unlimited" instead of the global default limit.



**Chat Feature (Medium)**

1.16 WHEN a user submits a message in `ChatWorkspace` and `NEXT_PUBLIC_HERMES_URL` is unset or
unreachable THEN the system returns a `502` from `/api/chat` but the UI does not surface a
user-visible error message — the chat input silently stops responding.

1.17 WHEN the Hermes SSE stream emits a `hermes.tool.progress` event whose payload is not a JSON
object with a `.tool` property THEN the system silently drops the chunk and no tool progress
indicator is shown.

---

### Expected Behavior (Correct)

**Queue / Fairness / Concurrency**

2.1 WHEN `queue_feeder.py` pushes task runs to Redis THEN the system SHALL use `rpush` so tasks are
appended to the tail/right of `backlink_queue`, preserving strict insertion (FIFO) order when
consumed via `blpop` from the left.

2.2 WHEN user A's tasks were enqueued before user B's tasks THEN the system SHALL process user A's
tasks first, guaranteeing FIFO ordering across all users.

2.3 WHEN the worker pops a job from Redis THEN the system SHALL check the parent task's `status`
and the task run's `status` in Supabase **before** dispatching to a worker slot, and SHALL discard
the job without consuming a slot if the status is `failed` for failed tasks it should retry but for `cancelled` task it should not fetch.

2.4 WHEN `get_idle_worker()` selects from the pool of IDLE workers THEN the system SHALL return the
worker with the lowest `last_used` timestamp (least-recently-used), ensuring load is spread evenly
across all available sessions.

**Browser / Tab Stability**

2.5 WHEN `execute_job()` detects a tab that has not progressed for more than a configurable timeout
THEN the system SHALL call `page.reload()` on the stuck tab before retrying navigation.

2.6 WHEN `get_page()` or `execute_job()` observes `page.url == "about:blank"` after navigation
has been attempted THEN the system SHALL close the affected page and call `context.new_page()` to
create a replacement tab before retrying.

2.7 WHEN a target site produces consecutive `PlaywrightTimeoutError` results indicating it is
completely unresponsive THEN the system SHALL open a new tab via `context.new_page()` and navigate
to the URL there, rather than reusing the stuck existing page.

2.8 WHEN `get_page()` is called and `page.is_closed()` returns `True` or a `TargetClosedError`
is raised THEN the system SHALL detect the closure, log a recovery event, and open a replacement
tab via `context.new_page()`.

**OCR / SolveMedia Captcha**

2.9 WHEN `process.extractOne()` returns a match THEN the system SHALL apply a minimum score
threshold of 80 and SHALL reject (return `{"text": "", "score": 0.0}`) any result below that
threshold.

2.10 WHEN the raw OCR text is fewer than 3 characters long THEN the system SHALL reject it outright
and return `{"text": "", "score": 0.0}` without performing fuzzy matching.

2.11 WHEN a fuzzy match is produced THEN the system SHALL verify that the matched word exists in the
loaded dictionary list before returning it; if the word is absent the system SHALL return
`{"text": "", "score": 0.0}`.

2.20 WHEN `process.extractOne()` is called in `ocr_fuzzer.py` THEN the system SHALL use
`scorer=fuzz.token_sort_ratio` (imported from `rapidfuzz`) instead of the default WRatio scorer.
`token_sort_ratio` tokenises both strings, sorts the tokens, and then compares — so minor
character-level OCR noise in individual words (a dropped space, a swapped letter) does not cause
a large score drop for a phrase that is clearly present in the dictionary. For example,
`"drawa blank"` against `"draw a blank"` scores ~95 with `token_sort_ratio` vs ~82 with WRatio.

2.21 WHEN the OCR-detected text, after scoring, produces a match with `token_sort_ratio` score
≥ 80 THEN the system SHALL verify that the matched phrase exists in the loaded dictionary before
returning it — ensuring no out-of-dictionary fabrication is accepted even under the more lenient
scorer.

**Safe Navigation / 5xx Handling**

2.12 WHEN `safe_goto()` receives a 5xx status code and the attempt is not the final retry THEN the
system SHALL call `page.reload(wait_until="commit")` before calling `page.goto()` again, ensuring
a hard browser refresh clears any cached error state.

**Invalid Email Generation**

2.13 WHEN `generate_natural_credentials()` has assembled an email address THEN the system SHALL
validate it against the pattern `r'^[^@\s]+@[^@\s]+\.[^@\s]+$'` before returning; if the
generated email is invalid the system SHALL regenerate up to 3 times before raising a `ValueError`.

**New Client Default Limit**

2.14 WHEN a new client is created via `POST /api/clients` THEN the system SHALL read the global
default backlink limit from the application settings (a `settings` table row with
`key = 'default_backlink_limit'` or a `DEFAULT_BACKLINK_LIMIT` environment variable), and SHALL
insert the client with `backlink_limit` set to that value.

2.15 WHEN no global default is configured THEN the system SHALL fall back to a hardcoded safe
default of 50 submissions/day rather than leaving `backlink_limit` as `NULL`.


**Chat Feature**

2.18 WHEN `POST /api/chat` returns a non-2xx status THEN the system SHALL surface a visible error
message in the chat UI (e.g., "Unable to reach the AI agent — check the Hermes service") rather
than silently failing.

2.19 WHEN the Hermes SSE `tool_progress` chunk does not conform to the expected shape THEN the
system SHALL log a warning and SHALL NOT throw an unhandled exception that terminates the stream
loop.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a valid, non-cancelled job is popped from Redis THEN the system SHALL CONTINUE TO dispatch
it to a worker and execute the full automation template.

3.2 WHEN a job fails mid-execution THEN the system SHALL CONTINUE TO retry it up to 3 times via
`rpush` to the queue tail before marking it permanently failed.

3.3 WHEN Redis is unavailable THEN the system SHALL CONTINUE TO fall back to direct Supabase
polling to fetch pending task runs.

3.4 WHEN a tab loads successfully THEN the system SHALL CONTINUE TO reuse the same tab for all
subsequent steps within the same job execution.

3.5 WHEN the browser CDP connection is lost THEN the system SHALL CONTINUE TO call
`worker.restart()` to fully reconnect before retrying.

3.6 WHEN the OCR result is a valid phrase present in the dictionary with a score ≥ 80 THEN the
system SHALL CONTINUE TO return it as the captcha answer.

3.7 WHEN the OCR service fails or the dictionary file is missing THEN the system SHALL CONTINUE TO
return `{"text": "", "score": 0.0}` and fall back to 2Captcha in `_solve_captcha()`.

3.8 WHEN `safe_goto()` receives a 4xx status code other than 403 THEN the system SHALL CONTINUE TO
retry with `page.goto()` without an extra reload.

3.9 WHEN all `safe_goto()` retries are exhausted THEN the system SHALL CONTINUE TO raise
`SiteDownError` as before.

3.10 WHEN `generate_natural_credentials()` produces a valid email on the first attempt THEN the
system SHALL CONTINUE TO return the full credentials dict unchanged.

3.11 WHEN an existing client already has a non-null `backlink_limit` THEN the system SHALL CONTINUE
TO return that per-client limit from `GET /api/clients/[id]/quota`.

3.12 WHEN `PATCH /api/clients/[id]/limit` explicitly sets `backlink_limit` to `null` THEN the
system SHALL CONTINUE TO store `NULL` and treat that client as having no submission cap.


3.14 WHEN Hermes is reachable and returns a well-formed SSE stream THEN the system SHALL CONTINUE
TO stream text deltas and tool progress events in real time to the chat UI.

3.15 WHEN the user clicks "Stop" in the chat UI THEN the system SHALL CONTINUE TO abort the fetch
via `AbortController` and save whatever content was accumulated.

3.16 WHEN the OCR correctly reads a phrase and `fuzz.token_sort_ratio` scores it at ≥ 80 against a
dictionary entry THEN the system SHALL CONTINUE TO return that phrase as the captcha answer without
falling through to 2Captcha.
