# Hermes Agency System Architecture & Workflow Analysis

This document provides a comprehensive analysis of the Agentic SEO / Hermes codebase. It breaks down how the frontend Next.js application, the Supabase database, and the Python worker collaborate to achieve automated, AI-driven agency execution.

## 1. High-Level Architecture Diagram

```text
+-------------------------------------------------------------+
|                FRONTEND (Next.js Web App)                   |
|                                                             |
|  [ User Dashboard ]     [ app/api/chat ]   [ app/api/tasks ]|
+---------+-----------------------+---------------------------+
          |                       |
   Manage | Tasks &               | Stream Chat (REST / SSE)
   Clients|                       |
          v                       v
+-----------------------+    +--------------------------------+
| DATABASE (Supabase)   |    | EXTERNAL SYSTEMS               |
|                       |    |                                |
|  [ State & Data ]     |    |  [ Hermes LLM API (8642) ]     |
|   - clients           |    +--------------------------------+
|   - profiles          |
|   - tasks, task_runs  |    +--------------------------------+
|   - backlinks, etc.   |    |  [ Target Websites for SEO ]   |
+---------+-------------+    +--------------------------------+
          ^                                   ^
          | Fetch pending tasks               | Actions on site
          | Log progress/results              |
          v                                   |
+---------------------------------------------+---------------+
| BACKEND WORKER (Python: hermes_worker.py)                   |
|                                                             |
|  [ Polling Mechanism (10s) ]                                |
|             |                                               |
|             v                                               |
|  [ ThreadPool Executor (Max 10) ]                           |
|             |                                               |
|             v                                               |
|      +-- Execution Engines ---------------+                 |
|      |  - Local Hermes AIAgent            |                 |
|      |  - Browser Use Cloud API           +-----------------+
|      +------------------------------------+                 |
+-------------------------------------------------------------+
```

## 2. Component Analysis

### A. The Frontend (Next.js)
The Next.js application (`agentic-seo`) serves as the central hub for users to interact with the system. 
- **Direct DB Access:** It communicates directly with Supabase via `@supabase/ssr` or `@supabase/supabase-js` to fetch tasks, campaigns, and display progress to users.
- **Chat API Proxy:** In `app/api/chat/route.ts`, the frontend acts as a proxy to stream chat messages from the Hermes agent endpoint (`http://localhost:8642`). It translates Hermes' Server-Sent Events (SSE) into standard UI-consumable text deltas and tool-progress updates.

### B. The Database (Supabase)
Supabase acts as the central source of truth and state machine.
- **Multi-Tenant Structure:** Everything is inherently multi-client and multi-user. Tables like `tasks`, `task_runs`, `chat_sessions`, and `backlinks` are strictly linked to `client_id`s. `profiles` represent the agency employees and are linked to clients via `client_members`.
- **Workflow State Management:** The `task_runs` table tracks workflow execution. A run has a `status` (pending, running, waiting_approval, completed, failed) and a `current_step_index` pointing to an array of steps defined in `workflow_templates`.

### C. The Worker (`hermes_worker.py`)
This is the workhorse of the system, running autonomously in the background (typically managed by PM2).
- **The Loop:** It continuously polls the Supabase `task_runs` table for entries where `status = 'pending'`.
- **Concurrent Execution:** It uses a `ThreadPoolExecutor` to handle up to 10 automated browser sessions simultaneously.
- **Step Execution:** For each task run, it extracts the current step from the workflow template. It then constructs a strict prompt for the AI.
- **Dynamic Tiering:** Depending on the target site's difficulty (`execution_tier`), it either uses a **Local Agent** (`AIAgent` using Gemini and local skills) for `standard` sites, or delegates to **Browser Use Cloud API** for `elite` sites (which have complex captchas and require proxy rotation).
- **Feedback Loop:** As the agent interacts with the web, results are parsed as JSON. Successes are written to the `backlinks` table, logs are written to `task_run_logs` (which the frontend reads in real-time), and the `current_step_index` is incremented.
- **Human-in-the-Loop:** If a step requires approval, it pauses execution and creates an entry in the `approvals` table. The frontend UI alerts the user, and once approved, the task resumes.

## 3. End-to-End Workflow Execution (Behind the Scenes)

Let's trace a typical SEO Backlink Task:

1. **Initiation:** A user via the UI selects a client and starts a backlinking workflow. The frontend inserts a new row into `task_runs` with `status: 'pending'` and a specific `workflow_template_id`.
2. **Detection:** Within 10 seconds, `hermes_worker.py` detects the pending `task_run`. It immediately locks it by setting `status = 'running'`.
3. **Execution Context:** The worker extracts the step details, the `target_site`, the `client_target_url`, and the `keyword` from the database.
4. **Agent Invocation:** It creates a prompt instructing the AI to navigate to the target site, register an account, and place the link. 
5. **AI Navigation:** The Local or Cloud agent takes control of a headless browser, interacts with the DOM, solves captchas, and submits the backlink.
6. **Result Parsing:** Once done, the agent outputs a strict JSON response containing the `live_url`.
7. **Verification & Storage:** The worker parses this JSON, verifies the URL isn't just the homepage, inserts a verified row into the `backlinks` table, and logs the success in `task_run_logs`.
8. **Progression:** The worker increments `current_step_index`. If steps remain, it sets the status back to `pending` so it can be picked up on the next poll. If finished, it marks it `completed`.

## 4. Multi-User & Multi-Client Workflows

The system achieves robust multi-tenancy through **Relational Foreign Keys**:
- **Clients & Members:** `clients` is the root entity. `profiles` (users) are granted access to specific clients via the `client_members` join table.
- **Data Isolation:** When a user logs in, the frontend filters all dashboards, tasks, and backlinks by the `client_id`s they have access to. 
- **Worker Agnosticism:** The Python worker doesn't care *who* requested the task. It simply reads the `client_id` and payload from the `task_runs` row and executes it. This allows unlimited users to queue tasks for unlimited clients without causing backend race conditions.

## 5. Vision Alignment & Potential Blockers

### How it achieves the Vision
The vision is to "build an AI-first operations platform that transforms agency execution." This architecture nails the core requirement:
- **Centralized Operations:** A single dashboard (Next.js) maps everything to DB state.
- **Automated Execution at Scale:** The Python thread pool can execute browser tasks continuously without human intervention, effectively scaling output.
- **Preserved Knowledge:** Successful task executions and methodologies are stored dynamically, reducing onboarding time for human employees.

### What Stops It (Potential Blockers)
While powerful, a few bottlenecks currently exist:
1. **Hardcoded Prompts:** Inside `hermes_worker.py` (lines ~157-164), the instruction prompt is heavily hardcoded for *SEO backlinking*. To scale to social media management or design as per the vision, the system needs a dynamic prompt generator based on the `workflow_templates.type`.
2. **Polling Database Bottleneck:** Polling a PostgreSQL DB every 10 seconds works well for a single VPS with 10 concurrent threads. As the agency scales to hundreds of tasks, this polling mechanism will cause DB contention. Transitioning to an event-driven message queue (e.g., Redis / Celery) will be necessary.
3. **Browser Automation Frailty:** AI-driven headless browsing is prone to breaking when target site layouts change drastically or anti-bot protections evolve. The fallback to the "Browser Use Cloud" API mitigates this, but remains a critical dependency point.
