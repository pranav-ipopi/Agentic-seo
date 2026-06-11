# VPS Playwright Automation Setup

This document outlines the architecture and deployment steps for the Python Playwright background worker that handles automated backlink generation.

## 1. Architecture Overview

### Components
1. **Frontend (`agentic-seo`)**: A Next.js application that provides the UI to start and manage campaigns, tasks, and view results.
2. **Database (`Supabase`)**: Handles queueing through the `task_runs` and `tasks` tables. Target sites and templates are matched using `target_site_id`.
3. **VPS Background Worker (`vps_worker_playwright.py`)**: A persistent Python process running on a VPS. It polls Supabase for pending tasks and utilizes Playwright to automate browser interactions concurrently.
4. **Stealth Browser Manager**: Powers the Playwright sessions using SeleniumBase CDP to bypass anti-bot systems like Cloudflare natively.

### Workflow
1. User starts an automation task from the frontend.
2. A new record is inserted into `task_runs` with a status of `pending` and specific state payload (target URLs, keywords).
3. The VPS Worker polls `task_runs` every 10 seconds.
4. Upon finding a pending task, the worker assigns it to an asynchronous task (up to 5 concurrently).
5. The worker checks the `target_site_id` to determine the template category (e.g., `pligg`).
6. The Playwright template navigates to the site, creates an account with random credentials, solves captchas (via 2Captcha), submits the backlink, and parses the live URL. Random 1-3 second delays are implemented to mimic human interaction.
7. The worker writes the result back to the `backlinks` table and updates `task_run_logs` and `task_runs` statuses.

---

## 2. Directory Structure

```text
Agentic_SEO/
├── agentic-seo/                # Next.js Frontend
│   └── supabase/migrations/    # Supabase Schema migrations
└── playwright_automation/      # Background Worker Code
    └── backlink_automation/
        ├── .env                # Environment variables
        ├── vps_worker_playwright.py  # Main entry point (Orchestrator)
        ├── methods/
        │   ├── stealth_browser.py    # Anti-bot browser configurations
        │   └── cloudflare.py         # Cloudflare bypass logics
        ├── services/
        │   └── captcha_service.py    # 2Captcha integrations
        └── templates/
            └── pligg_generic.py      # Generic execution template
```

---

## 3. VPS Deployment Instructions

### Prerequisites
- SSH access to your Ubuntu/Debian VPS.
- Python 3.10+ installed.
- Node.js & NPM installed (for PM2).

### Step 1: Clone Repository & Setup Environment
SSH into your VPS and navigate to the project directory:
```bash
cd ~/Agentic_SEO/playwright_automation/backlink_automation
```

Create and activate a Python virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
```

Install the required Python dependencies:
```bash
pip install -r requirements.txt
# Ensure Playwright browser binaries are installed
playwright install chromium
```

### Step 2: Configure Environment Variables
Create a `.env` file in `playwright_automation/backlink_automation/`:
```bash
nano .env
```
Add your Supabase credentials and 2Captcha API key:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-key
TWOCAPTCHA_API_KEY=your-2captcha-key
POLL_INTERVAL_SECONDS=10
```

### Step 3: Run as a Background Service using PM2
To ensure the worker runs continuously and restarts on failure, we use PM2.

Install PM2 globally if you haven't already:
```bash
npm install -g pm2
```

Start the Python worker with PM2. Make sure to point the interpreter to your virtual environment's python path:
```bash
pm2 start vps_worker_playwright.py --name "playwright-worker" --interpreter ./venv/bin/python
```

Save the PM2 list so it restarts automatically on server reboots:
```bash
pm2 save
pm2 startup
```

### Step 4: Monitoring and Logging
You can view real-time logs of the Playwright worker by running:
```bash
pm2 logs playwright-worker
```
If you need to restart the worker after deploying new code:
```bash
pm2 restart playwright-worker
```

---

## 4. Expanding Templates
To support new site architectures:
1. Create a new file in `templates/` (e.g., `elgg_generic.py`).
2. Implement an asynchronous `run()` method similar to `PliggGenericTemplate`.
3. In `vps_worker_playwright.py`, update the router logic to map the new database category to your new template class.
