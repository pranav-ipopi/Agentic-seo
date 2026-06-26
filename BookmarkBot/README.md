# BookmarkBot Windows Service Scaffold

This is a production-ready Windows + SeleniumBase + Supabase + NSSM scaffold for **authorized browser automation**.

Important: this build intentionally does **not** include Cloudflare/CAPTCHA bypass, stealth evasion, or access-control circumvention code. Use it only on sites/accounts where you have permission to automate.

## Production hardening added

The scaffold now includes operational improvements for a 5000 jobs/day target:

- `rate_limiter.py` — global and per-host start-rate control to prevent worker stampedes
- `metrics.py` — success/failure/retry counters and projected daily throughput
- `proxy_manager.py` — optional deterministic per-worker outbound proxy assignment for approved environments
- stale `running` job recovery after crashes/reboots
- stable worker profiles and configurable browser window size
- `proxies.example.txt` template

For 5000/day, the sustainable average is about **208 completed jobs/hour**. The default global start interval is calculated as `86400 / JOBS_PER_DAY_TARGET`, which is about **17.28 seconds** for 5000/day.

## Files

- `config.py` — environment-driven settings
- `logger_setup.py` — daily rotating-ish file logger by date
- `db.py` — Supabase job queue helpers
- `worker.py` — worker lifecycle and safe `execute_job()` template
- `main.py` — orchestrator loop
- `profile_init.py` — optional manual profile setup for authorized accounts
- `.env.example` — copy to `.env`
- `requirements.txt` — Python dependencies
- `start.bat` — NSSM-friendly Windows launcher
- `supabase_schema.sql` — Supabase table schema
- `rate_limiter.py` — global/per-host start-rate limiter
- `metrics.py` — throughput counters
- `proxy_manager.py` — optional deterministic worker proxy assignment
- `proxies.example.txt` — optional proxy file template

## Windows install

```powershell
mkdir C:\BookmarkBot
copy /Y * C:\BookmarkBot\
cd C:\BookmarkBot
python -m venv C:\BookmarkBot\venv
C:\BookmarkBot\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
notepad .env
```

Create the Supabase table using `supabase_schema.sql`.

## Test run

Insert a test job:

```sql
insert into jobs (url, action) values ('https://example.com', 'visit');
```

Then run:

```powershell
C:\BookmarkBot\venv\Scripts\python.exe C:\BookmarkBot\main.py
```

## Supported built-in actions

### `visit`

```json
{"url": "https://example.com", "action": "visit"}
```

### `click`

```json
{"url": "https://example.com", "action": "click", "selector": "#my-button"}
```

### `fill_and_submit`

```json
{
  "url": "https://example.com/form",
  "action": "fill_and_submit",
  "fields": {"#name": "Alice", "#email": "alice@example.com"},
  "submit_selector": "button[type='submit']"
}
```

## Optional approved proxy routing

If your customer or environment requires an outbound proxy, copy the example file:

```powershell
copy proxies.example.txt proxies.txt
notepad proxies.txt
```

Then set in `.env`:

```env
PROXY_MODE=static_per_worker
PROXY_LIST_FILE=C:\BookmarkBot\proxies.txt
```

Workers are assigned proxies deterministically, so `worker_0` keeps the same proxy across its persistent profile.

## 5000/day tuning

Defaults are conservative and smooth job starts:

```env
JOBS_PER_DAY_TARGET=5000
NUM_WORKERS=10
JOBS_PER_BATCH=1000
PER_HOST_MIN_JOB_START_INTERVAL=30
START_JITTER_MAX_SECONDS=2
```

If jobs take longer than expected, increase `NUM_WORKERS` gradually while watching CPU, RAM, Chrome crashes, and site/API authorization limits.

## NSSM setup

Install service with GUI:

```powershell
C:\nssm\win64\nssm.exe install BookmarkBot
```

Application tab:

```text
Path:        C:\BookmarkBot\venv\Scripts\python.exe
Startup dir: C:\BookmarkBot
Arguments:   C:\BookmarkBot\main.py
```

I/O tab:

```text
Output: C:\BookmarkBot\logs\nssm_output.log
Error:  C:\BookmarkBot\logs\nssm_error.log
```

Start/check:

```powershell
C:\nssm\win64\nssm.exe start BookmarkBot
C:\nssm\win64\nssm.exe status BookmarkBot
```
