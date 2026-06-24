# Graph Report - Agentic_SEO  (2026-06-24)

## Corpus Check
- 165 files · ~85,594 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 965 nodes · 1403 edges · 105 communities (87 shown, 18 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `09fec8a4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]

## God Nodes (most connected - your core abstractions)
1. `createServiceClient()` - 39 edges
2. `createClient()` - 27 edges
3. `createClient()` - 26 edges
4. `Client` - 22 edges
5. `StealthBrowserManager` - 21 edges
6. `useClient()` - 17 edges
7. `cn()` - 17 edges
8. `BaseTemplate` - 17 edges
9. `PliggGenericTemplate` - 17 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `check_and_update_parent_task()` --references--> `Client`  [EXTRACTED]
  playwright_worker/vps_worker_playwright.py → agentic-seo/lib/supabase/types.ts
- `mark_parent_task_running()` --references--> `Client`  [EXTRACTED]
  playwright_worker/vps_worker_playwright.py → agentic-seo/lib/supabase/types.ts
- `route_and_execute()` --references--> `Client`  [EXTRACTED]
  playwright_worker/vps_worker_playwright.py → agentic-seo/lib/supabase/types.ts
- `DashboardLayout()` --calls--> `createClient()`  [EXTRACTED]
  agentic-seo/app/dashboard/layout.tsx → agentic-seo/lib/supabase/server.ts
- `POST()` --calls--> `createServiceClient()`  [INFERRED]
  agentic-seo/app/api/campaigns/execute/route.ts → agentic-seo/lib/supabase/server.ts

## Import Cycles
- None detected.

## Communities (105 total, 18 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (38): POST(), DELETE(), DELETE(), DELETE(), POST(), GET(), PATCH(), POST() (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (22): ClientContextValue, ArticleWorker, check_articles_today(), _fallback_article_body(), generate_article_body(), get_pending_job(), get_supabase(), lock_job() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (45): dependencies, class-variance-authority, clsx, @copilotkit/react-core, @copilotkit/runtime, exceljs, file-saver, ioredis (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (14): Backend, Data Hierarchy (Agency OS Model), Database Relationship Diagram, Directory Structure, Frontend, Global Role (on `profiles.role`) — Unchanged from V1, Hermes Agency OS — Architecture, Hermes Agent Integration (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.23
Nodes (8): calculate_human_path(), handle_cloudflare_challenge(), move_mouse_humanlike(), Enhanced Cloudflare Turnstile bypass with human-like mouse movement., Generates a smooth, human-like curved mouse path between two coordinates., Moves Playwright's mouse from a random starting position to the target     coord, main(), main()

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (7): LoginPage(), SettingsPage(), createClient(), Profile, TeamSettingsPage(), KeywordsModal(), SiteListModal()

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (14): _generate_random_credentials(), PliggGenericTemplate, Safely navigates to a URL and immediately executes active Turnstile          ha, Navigate to home page and wait for load., Register a new account if we are not logged in.         After registration, we, Heuristic to detect logged-in state., Perform registration with generated credentials., Generate random registration credentials for this job. (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (16): `agency_memory`, `approvals`, `backlinks`, `chat_messages`, `chat_sessions`, `client_members`, `client_memory`, `clients` (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (11): ABC, BaseTemplate, Heuristic to detect logged-in state using config-driven text markers.         Ch, Generate random registration credentials for automation jobs., Generate more natural-looking credentials (used by WordPress SubmitPro)., Try multiple strategies to find the newly created story/article URL.         Use, Execute the full backlink creation flow.          Args:             client_site:, Abstract base template. All site automation templates extend this.      Construc (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (10): Supabase Service for Backlink Automation V1  Handles all database interactions w, Mark job as completed and store the created backlink URL in state., Handle failure + retry logic.         If retry_count < max_retries: set status b, Fetch a single job by id (useful for verification)., Return active target_sites rows where site_id has not been detected yet., Write the detected CMS template back to target_sites.site_id.          Args:, ISO format timestamp for updated_at., Fetch the oldest pending backlink job.         NOTE: Filters to type='backlink' (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.36
Nodes (6): ACTION_TYPE_LABELS, ApprovalCard(), ApprovalCardProps, ApprovalsPage(), formatRelativeTime(), Approval

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (18): `app/api/chat/route.ts`, Assigning a user to a department (server-side), Code Changes (Already Applied), Creating a task_run scoped to a department, `department_members`, `departments`, Filtering tasks by department, How to Apply the Migration (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (14): AgencyMemory, ApprovalStatus, Backlink, BacklinkStatus, ClientMember, ClientMemory, Database, Department (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (11): ChatMessages(), ChatMessagesProps, PROMPT_MAPPING, renderMarkdown(), ToolStep, ChatWorkspace(), ChatWorkspaceProps, metadata (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (15): clear_cache(), _deep_merge(), _extract_domain(), load_config(), _load_json_file(), load_site_override(), load_template_config(), Config Loader for Backlink Automation  Loads template default configs and merges (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (9): Exception, FailureHandler, Extract logs for the specific task run and upload to Supabase., Full failure handling pipeline:         1. Classify the error         2. Capture, Update site health on successful execution., Update target_sites health tracking columns.          On success:             -, Handles failure classification, evidence capture, and site health tracking., Classify an exception into a structured error_type string.          Returns one (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (8): Base Template for Backlink Automation  Abstract base class that all site templat, PliggGenericTemplate, Generic Pligg/Kliqqi CMS Site Template (Config-Driven)  This is a universal impl, Register a new account if not logged in., Generic Pligg/Kliqqi submission template.     Handles:     - Cloudflare Turnstil, Logout using config-driven selectors., Main entry point. Executes the full backlink creation flow., Navigate to home page with retry logic and Cloudflare bypass.

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (14): 1. Install Redis, 2. Configure for External Access & Security, 3. Open the Firewall, All VPS Workers (`playwright_automation/backlink_automation/.env`), 🏛 Architecture Overview, 📊 Monitoring the System, Multi-VPS Redis Queue Setup, Network Topology (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.19
Nodes (11): AutomationError, ConnectionTimeoutError, LoginFailedError, Typed Error Classes for Backlink Automation  Each error class represents a speci, Base error for all automation failures.          Attributes:         error_type:, Page load timed out after all retry attempts., A required DOM element could not be found.     This usually means the site chang, Login attempt failed — wrong credentials, account locked, etc. (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (5): Generic Pligg/Kliqqi CMS Site Template  This is a universal implementation tha, # IMPORTANT: Use fill() here — NOT press_sequentially., execute_task(), main(), Captcha Service - Reusable Abstraction for Backlink Automation V1  This service

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (13): Auth & Routing, Chat → Hermes Pipeline, Environment & Supabase Clients, Frontend ↔ Backend Configuration Audit, Gap 1 — `ChatWorkspace` does NOT pass `department` to Hermes, Gap 2 — `RunConfigurationPanel` does NOT set `department_id` on `task_runs`, Gap 3 — `ChatWorkspace` does NOT set `department_id` on `tasks` or `chat_messages`, ⚠️ Gaps Found — Frontend Not Yet Using Phase 2 Fields (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (22): PromptInput(), PromptInputProps, cn(), CATEGORIES, SkillsPage(), Skill, getSkillsForStepType(), HermesSkill (+14 more)

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (9): CaptchaFailedError, Account registration failed — duplicate user, blocked domain, etc., Captcha solving failed after all attempts., RegistrationFailedError, cloudflare_updated(), Navigate to the URL using the stealth browser and return raw HTML.          Uses, Solve SolveMedia captcha using 2Captcha service. All selectors from config., Perform registration with generated credentials. All selectors from config. (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (19): Any, _build_registry(), _get_registry(), Template Runner for Backlink Automation  Centralized template resolution + confi, Resolves the correct template class + merged config for a given site,     then e, Return list of registered site_id values., Check if a site_id has a registered template., Execute the full automation flow for a site.          Args:             site_id: (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (11): BacklinkWorker, main(), Backlink Automation Engine - Simple Worker  Simple polling worker for single-sit, Secondary loop: periodically scans for target_sites with no detected         tem, Entry point — runs the job loop and detection loop concurrently., Graceful shutdown on SIGTERM / SIGINT (Docker friendly)., Process a single job using the TemplateRunner., log_event() (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (11): 1. Database-Level Isolation, 2. Frontend Configuration (`ArticleRunConfigurationPanel.tsx`), 3. Backend Queuing (`app/api/campaigns/execute-articles/route.ts`), 4. Isolated Python Worker (`article_worker.py`), 5. Secure Proxies (`app/api/browser-use/profiles/route.ts`), Architectural Design, Article Submission Workflow Architecture, Environment Variables (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (11): 1. Architecture Overview, 2. Local Setup, 3. Automated VPS Deployment (`deploy.ps1`), 4. How to Set Up a Brand New VPS (From Scratch), Playwright Worker Setup & Deployment Guide, Step 1: Install Node.js, PM2, and Python Venv, Step 2: Install Google Chrome & Virtual Display (For SeleniumBase/Playwright), Step 3: Create the App Directory and Virtual Environment (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (6): Site is unreachable — connection refused, DNS failure, or HTTP 5xx., Bookmark/article submission failed., SiteDownError, SubmissionFailedError, Generic WordPress SubmitPro template.     Handles registration and bookmark subm, WordPressSubmitProTemplate

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): 1. Database Migration (Required), 2. Edge Function Update, 3. Install Dependencies, Backlink Automation System V2, 📂 Directory Structure, 🚨 Failure Handling & Health States, 🧱 How to Add a Completely New Template, 📖 How to Add a Site-Specific Override (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (14): DashboardLayout(), metadata, ClientContext, ClientProvider(), useClient(), RightSidebar(), TaskRunExtended, Task (+6 more)

### Community 32 - "Community 32"
Cohesion: 0.19
Nodes (7): Template Detector (Playwright-based)  Replaces the Supabase Edge Function `detec, Inspect the raw HTML and return the matching template ID, or None if         no, Check if <meta name="generator"> content contains any of the keywords., Check if any <form> element has an action attribute matching path_segment., Navigates to a site URL using the stealth browser and fingerprints its CMS., Detect the CMS/template of a site by navigating to its homepage.          Args:, TemplateDetector

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (4): CaptchaService, Specific helper for SolveMedia (used on livebookmarking.com register).         I, Abstract captcha solver.      V1: Stub implementation only., Solve a captcha.          Args:             page: Playwright page object (for co

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (9): Adding and Formatting Proxies, Architecture Overview, Configuration Files, Health Check Logs, How It Works, Key Components:, Proxy Management System, Supported Formats (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (14): Failure Handler for Backlink Automation  Responsibilities:     - Classify errors, check_and_update_parent_task(), detect_and_update(), mark_parent_task_running(), poll_queue(), VPS Worker - Backlink Automation Orchestrator  Polls Supabase for pending task, Fingerprints an undetected site using the Playwright stealth browser     and wr, Executes a single step of a workflow task_run.     Uses TemplateRunner for conf (+6 more)

### Community 36 - "Community 36"
Cohesion: 0.28
Nodes (6): POST(), buildClientSystemMessage(), DEPARTMENT_PERSONAS, HermesChunk, HermesMessage, HermesToolProgress

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (8): background, service_worker, host_permissions, manifest_version, minimum_chrome_version, name, permissions, version

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (8): background, service_worker, host_permissions, manifest_version, minimum_chrome_version, name, permissions, version

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 40 - "Community 40"
Cohesion: 0.20
Nodes (8): TaskRun, TaskRunLog, SIMULATED_LOGS, STATUS_FILTERS, StatusFilter, TaskRunExtended, TasksPage(), downloadCampaignExcelReport()

### Community 41 - "Community 41"
Cohesion: 0.21
Nodes (4): Manages an undetected Chromium session (SeleniumBase CDP) with Playwright., Fresh isolated context, images allowed to pass Cloudflare. Close via page.contex, Fresh isolated context, images allowed (SolvMedia needs them)., StealthBrowserManager

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (7): 1. Passive Evasion Layer (SeleniumBase CDP), 2. Active Defense Layer (Human-Mouse Emulation), 3. The Defensive Navigation Loop (`safe_goto`), 4. Failure Handling Strategy, Cloudflare Stealth & Active Defense Architecture, Fingerprint Hardening (VPS/Docker Safe), How it Works:

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (7): 1. Running on a Cloud VPS (Single User), 2. Next.js SaaS Architecture (Multi-User), 3. Executing the Multi-User Automation, Approach A: The "Cloud Browser" (Streaming), Approach B: The "Browser Extension" (Recommended), Playwright Authentication & Session Management Guide, Workflow:

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (7): 1. Registration Flow & Credentials, 2. Robust Captcha Solving (SolveMedia via 2Captcha), 3. Handling Invalid Captchas (Retry Logic), 4. The Two-Step Bookmark Submission Process, 5. Extracting the Final Backlink, Pligg Site Automation Knowledge (LiveBookmarking Template), Summary Checklist for New Pligg Templates:

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (7): 1. Passive Evasion Layer (SeleniumBase CDP), 2. Active Defense Layer (Human-Mouse Emulation), 3. The Defensive Navigation Loop (`safe_goto`), 4. Failure Handling Strategy, Cloudflare Stealth & Active Defense Architecture, Fingerprint Hardening (VPS/Docker Safe), How it Works:

### Community 46 - "Community 46"
Cohesion: 0.27
Nodes (4): Database Schema Reference, Realtime Subscriptions, RLS Policy Summary, Table Summary

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (8): AI Agent Integration, For Developers, Graphify Setup & Usage Guide, How the Initial Setup Was Done, How to Use It, Keeping It Updated, What is Graphify?, Why is it Helpful?

### Community 48 - "Community 48"
Cohesion: 0.40
Nodes (3): inter, metadata, ThemeProvider()

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 50 - "Community 50"
Cohesion: 0.60
Nodes (3): config, middleware(), updateSession()

### Community 51 - "Community 51"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Learn More, Getting Started

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 53 - "Community 53"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 54 - "Community 54"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 92 - "Community 92"
Cohesion: 0.22
Nodes (8): Boundaries, Intensity, Output, Persistence, Ponytail, Rules, The ladder, When NOT to be lazy

### Community 93 - "Community 93"
Cohesion: 0.25
Nodes (8): ✅ Already Supported in V1 (Unchanged), ✅ Fixed in Phase 2 (This Session), Gap Analysis Results, Phased Roadmap, Readiness Summary (Updated), ⚠️ Still Outstanding (Future Work), The Target Hierarchy, V1 Architecture → Agency OS Gap Analysis

### Community 94 - "Community 94"
Cohesion: 0.32
Nodes (6): bypass_cloudflare(), calculate_human_path(), move_mouse_humanlike(), Wait for Cloudflare to naturally pass due to our stealthy browser.     If it doe, Generates a smooth, human-like curved mouse path between two coordinates.      U, Moves Playwright's mouse from a random starting position to the target     coord

### Community 95 - "Community 95"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 96 - "Community 96"
Cohesion: 0.29
Nodes (7): Architecture Overview, Hermes - Agentic SEO Platform, Getting Started, Mission, Problem Statement, Strategic Objectives, Vision

### Community 98 - "Community 98"
Cohesion: 0.50
Nodes (4): getInitials(), LeftSidebar(), NAV_ITEMS, ChatSession

### Community 99 - "Community 99"
Cohesion: 0.40
Nodes (4): Boundaries, Hunt, Output, Tags

### Community 100 - "Community 100"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 101 - "Community 101"
Cohesion: 0.40
Nodes (4): Boundaries, Examples, Format, Scoring

### Community 102 - "Community 102"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 103 - "Community 103"
Cohesion: 0.67
Nodes (3): Documents, Hermes Agency OS — Project Documentation, Quick Reference

## Knowledge Gaps
- **331 isolated node(s):** `metadata`, `TaskRunExtended`, `graphify`, `ponytail`, `Usage` (+326 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Client` connect `Community 1` to `Community 0`, `Community 98`, `Community 35`, `Community 6`, `Community 14`, `Community 31`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `StealthBrowserManager` connect `Community 41` to `Community 33`, `Community 1`, `Community 4`, `Community 7`, `Community 25`, `Community 26`, `Community 94`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `route_and_execute()` connect `Community 35` to `Community 17`, `Community 1`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createServiceClient()` (e.g. with `POST()` and `DELETE()`) actually correct?**
  _`createServiceClient()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `metadata`, `TaskRunExtended`, `graphify` to the rest of the system?**
  _456 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06861239119303636 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._