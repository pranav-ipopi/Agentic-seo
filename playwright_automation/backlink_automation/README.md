# Backlink Automation System V2

Welcome to the **Config-Driven Backlink Automation System**. This system is designed to automate the creation of backlinks across hundreds of websites (Pligg, WordPress SubmitPro, etc.) with high reliability and ease of maintenance.

## 🌟 What's New in V2?

We completely restructured the automation engine to decouple the automation logic from the HTML selectors.

1. **Config-Driven Architecture:** Every single CSS selector is now stored in JSON config files instead of being hardcoded in Python.
2. **Per-Site Overrides:** If one site out of 500 changes its submit button, you can create a 5-line JSON file to override just that button for that specific site, without touching the main template.
3. **Failure Classification:** Errors are now caught and classified into categories like `SITE_DOWN`, `SELECTOR_NOT_FOUND`, `CAPTCHA_FAILED`, etc.
4. **Evidence Capture:** On failure, the system automatically captures a full-page screenshot, an HTML dump, and logs the current URL.
5. **Site Health Tracking:** The `target_sites` table now tracks consecutive failures and marks sites as `active`, `failing` (5+ failures), or `down`.

---

## 📂 Directory Structure

```text
backlink_automation/
├── configs/
│   ├── config_loader.py          # Merges template defaults + site overrides
│   ├── templates/                # Default selectors per template
│   │   ├── pligg.json
│   │   └── wordpress_submitpro.json
│   └── sites/                    # Per-site JSON overrides go here
│
├── executor/
│   ├── runner.py                 # Resolves which template to use
│   ├── failure_handler.py        # Classifies errors and updates site health
│   └── errors.py                 # Typed automation error classes
│
├── templates/
│   ├── base_template.py          # Shared logic (retry, captcha, login detection)
│   ├── pligg_generic.py          # Pligg/Kliqqi automation logic
│   └── wordpress_submitpro.py    # WordPress SubmitPro automation logic
│
├── vps_worker_playwright.py      # Production Supabase Polling Worker
├── worker.py                     # Simple alternative worker
└── migrations/
    └── 001_add_health_tracking.sql # Required DB schema changes
```

---

## 🛠️ Setup Instructions

### 1. Database Migration (Required)
To enable Site Health tracking and Failure Classification, you must add 5 new columns to your `target_sites` table.

Run the provided SQL script in your Supabase SQL Editor:
👉 `migrations/001_add_health_tracking.sql`

### 2. Edge Function Update
The site detection edge function `detect-site-templates` was updated to map PHPLD sites to `wordpress_submitpro`. Make sure to deploy the edge function using the Supabase CLI:
```bash
cd ../agentic-seo
supabase functions deploy detect-site-templates
```

### 3. Install Dependencies
Ensure you have the required Python packages:
```bash
pip install -r requirements.txt
playwright install
```

---

## 📖 How to Add a Site-Specific Override

If a specific site (e.g., `example-site.com`) has a unique layout or changes its submit button, you don't need to write a new Python script.

1. Find the site's UUID from the `target_sites` table (e.g., `550e8400-e29b-41d4-a716-446655440000`).
2. Create a JSON file in `configs/sites/` named with that UUID or domain (e.g., `configs/sites/550e8400-e29b-41d4-a716-446655440000.json`).
3. Add only the keys you want to override.

**Example Override (`configs/sites/example-site.com.json`):**
```json
{
  "template_type": "pligg",
  "submission": {
    "submit_button": ".new-custom-submit-btn"
  }
}
```
*The system will deep-merge this with the `pligg.json` template defaults.*

---

## 🔧 How to Test the System

You can test the automation locally via the Terminal Router without needing to insert jobs into the database.

1. Navigate to the `playwright_automation` directory.
2. Run the terminal router:
```bash
python Bookmark_sites_tester/terminal_router.py
```
3. The prompt will ask you for:
   - **Target URL:** `https://push2bookmark.com/`
   - **Site Type:** `pligg` or `wordpress_submitpro`
   - **Client URL:** `https://your-client-site.com`
   - **Keyword:** `digital marketing`

---

## 🚨 Failure Handling & Health States

When a job fails, the `FailureHandler`:
1. Classifies the error (e.g., `SELECTOR_NOT_FOUND`).
2. Takes a screenshot and saves it to `logs/failures/`.
3. Logs the failure with structured metadata to `task_run_logs`.
4. Updates `target_sites` health.

**Health States:**
- `active`: Working normally. Last run was a success.
- `failing`: Has failed 5 or more times consecutively. Requires human review.
- `down`: Failed due to a `SITE_DOWN` network error (connection refused, 502 Bad Gateway).
- `disabled`: Set manually by admins.

---

## 🧱 How to Add a Completely New Template

If you need to support a new CMS (e.g., Scuttle):

1. **Create Config:** Create `configs/templates/scuttle.json` containing all the CSS selectors.
2. **Create Template:** Create `templates/scuttle.py` extending `BaseTemplate`. Use `self.get_selector()` instead of hardcoding strings.
3. **Register It:** Open `executor/runner.py` and add it to the `_build_registry()` dictionary.
4. **Update Detection:** Update the Supabase Edge Function to fingerprint Scuttle sites and assign the `scuttle` site_id.
