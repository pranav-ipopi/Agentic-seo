# Article Submission Workflow Architecture

## Overview
The Article Submission workflow automates the process of generating high-quality SEO articles using LLMs and publishing them to high Domain Authority (DA) platforms (like Blogger, Tumblr, SlideShare, WordPress) using the BrowserUse Cloud API.

It operates entirely within the existing Agentic SEO application infrastructure, reusing the `task_runs` queue in Supabase, but runs via a completely isolated Python worker.

## Architectural Design

### 1. Database-Level Isolation
To ensure zero interference with the existing Backlink worker running on the VPS, a new `type` column was added to the `task_runs` table in Supabase.
- **Backlink Jobs:** `type = 'backlink'` (Default for all existing rows and standard execute API)
- **Article Jobs:** `type = 'article_submission'`

The Backlink Python worker processes (`worker.py` and `vps_worker_playwright.py`) only poll jobs where `type = 'backlink'`.

### 2. Frontend Configuration (`ArticleRunConfigurationPanel.tsx`)
A dedicated configuration panel for Article Submission is rendered when the selected workflow template is named "Article Submission".
- **Campaign Details:** Client Target URL, Campaign Name.
- **Article Content:** Article Title, Instructions/Description, Target Keywords.
- **Platform Multi-Select:** Users can select predefined high-DA sites or input custom URLs.
- **BrowserUse Profile Integration:** Fetches user-configured profiles from the BrowserUse API to use persistent browser sessions (preserving cookies/logins).
- **Scheduling:** Users can define how many articles should be published per day per client.

### 3. Backend Queuing (`app/api/campaigns/execute-articles/route.ts`)
When a user launches a campaign:
1. Validates inputs and fetches target keywords from the `keywords` table.
2. Creates a parent `campaigns` and `tasks` record.
3. Bulk inserts `task_runs` (Platforms × Keywords) with `type = 'article_submission'`.
4. The `state` JSON payload stores all necessary configuration (title, platform, profile ID, rate limits) for the worker.

### 4. Isolated Python Worker (`article_worker.py`)
A standalone async Python worker designed to handle the `article_submission` tasks.
- **Polling:** Checks `task_runs` for `status = pending` AND `type = 'article_submission'`.
- **Rate Limiting:** Checks how many articles have been submitted today for a specific client to respect the `articles_per_day` setting.
- **Content Generation:** Calls the OpenAI API (`gpt-4o-mini`) to generate a 600-800 word article based on the provided title, description, and keyword.
- **Browser Automation:**
  1. Creates a BrowserUse v3 session using the `profile_id` to maintain login persistence.
  2. Submits a natural language task instructing the browser agent to navigate to the platform, create the post, inject the backlink, and publish.
  3. Polls the session until completion.
  4. Stops the session to save the browser profile state.
- **Logging:** Updates task status and inserts detailed execution logs into `task_run_logs`.

### 5. Secure Proxies (`app/api/browser-use/profiles/route.ts`)
To prevent the `BROWSER_USE_API_KEY` from leaking to the browser, a secure Next.js API route acts as a proxy for fetching profiles.

## Setup and Deployment

### Environment Variables
**Next.js (`.env.local`)**
```env
BROWSER_USE_API_KEY=bu_your_key_here
```

**Python Worker (`article_worker_env.example`)**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
BROWSER_USE_API_KEY=bu_your_key_here
OPENAI_API_KEY=sk-your-openai-key-here
POLL_INTERVAL_SECONDS=60
MAX_RETRIES=3
SESSION_TIMEOUT_SECONDS=600
```

### Execution (Production via PM2)
To ensure the worker runs continuously, survives VPS reboots, and automatically retries upon unexpected crashes, we use [PM2](https://pm2.keymetrics.io/).

An `ecosystem.config.js` file is provided in the `playwright_automation/article_sub/` directory.

1. **Install Python Dependencies:**
   The article worker requires `httpx`, `supabase`, and `python-dotenv`. Navigate to the worker directory and install them:
   ```bash
   cd playwright_automation/article_sub
   pip install -r requirements.txt
   # OR: pip install httpx supabase python-dotenv
   ```

2. **Install PM2 globally** (if you haven't already):
   ```bash
   npm install -g pm2
   ```

3. **Start the worker:**
   Start the process using PM2 from the `article_sub` directory:
   ```bash
   cd playwright_automation/article_sub
   pm2 start ecosystem.config.js --only article-worker
   ```
   *(Note: The ecosystem file also includes configuration for the `backlink-worker` if you want to manage both via PM2. It is configured to properly run the backlink worker from its separate directory).*

3. **Save the PM2 process list:**
   To ensure the worker restarts automatically if the VPS server reboots:
   ```bash
   pm2 save
   pm2 startup
   ```

4. **Monitoring:**
   You can monitor the worker's status and view live logs:
   ```bash
   pm2 status
   pm2 logs article-worker
   ```
