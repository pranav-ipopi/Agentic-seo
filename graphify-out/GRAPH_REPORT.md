# Graph Report - Agentic_SEO  (2026-06-26)

## Corpus Check
- 163 files · ~85,298 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 937 nodes · 1270 edges · 101 communities (84 shown, 17 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.63)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cc55d363`
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
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
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
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 111|Community 111]]

## God Nodes (most connected - your core abstractions)
1. `createServiceClient()` - 40 edges
2. `createClient()` - 29 edges
3. `createClient()` - 26 edges
4. `PliggGenericTemplate` - 19 edges
5. `cn()` - 18 edges
6. `useClient()` - 17 edges
7. `BaseTemplate` - 17 edges
8. `compilerOptions` - 16 edges
9. `Schema Details` - 16 edges
10. `WordPressSubmitProTemplate` - 14 edges

## Surprising Connections (you probably didn't know these)
- `check_and_update_parent_task()` --references--> `Client`  [EXTRACTED]
  playwright_worker/vps_worker_playwright.py → agentic-seo/lib/supabase/types.ts
- `mark_parent_task_running()` --references--> `Client`  [EXTRACTED]
  playwright_worker/vps_worker_playwright.py → agentic-seo/lib/supabase/types.ts
- `route_and_execute()` --references--> `Client`  [EXTRACTED]
  playwright_worker/vps_worker_playwright.py → agentic-seo/lib/supabase/types.ts
- `cloudflare_updated()` --calls--> `handle_cloudflare_challenge()`  [INFERRED]
  playwright_worker/methods/cloudflare.py → playwright_worker/methods/stealth_browser.py
- `TemplateRunner` --uses--> `PliggGenericTemplate`  [INFERRED]
  playwright_worker/executor/runner.py → playwright_worker/templates/pligg_generic.py

## Import Cycles
- None detected.

## Communities (101 total, 17 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (36): DELETE(), DELETE(), DELETE(), POST(), GET(), PATCH(), POST(), POST() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.29
Nodes (4): cloudflare_updated(), Navigate to the URL using the stealth browser and return raw HTML.          Uses, Centralized defensive navigation. Handles network-level retries,         forces, Navigate to home page with retry logic and Cloudflare bypass.

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (45): dependencies, class-variance-authority, clsx, @copilotkit/react-core, @copilotkit/runtime, exceljs, file-saver, ioredis (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (14): Backend, Data Hierarchy (Agency OS Model), Database Relationship Diagram, Directory Structure, Frontend, Global Role (on `profiles.role`) — Unchanged from V1, Hermes Agency OS — Architecture, Hermes Agent Integration (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (16): bypass_cloudflare(), calculate_human_path(), move_mouse_humanlike(), Wait for Cloudflare to naturally pass due to our stealthy browser.     If it doe, Generates a smooth, human-like curved mouse path between two coordinates.      U, Moves Playwright's mouse from a random starting position to the target     coord, calculate_human_path(), handle_cloudflare_challenge() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.23
Nodes (9): ApprovalsPage(), LoginPage(), SettingsPage(), createClient(), Profile, TeamSettingsPage(), downloadCampaignExcelReport(), KeywordsModal() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (16): `agency_memory`, `approvals`, `backlinks`, `chat_messages`, `chat_sessions`, `client_members`, `client_memory`, `clients` (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (12): ABC, BaseTemplate, Base Template for Backlink Automation  Abstract base class that all site templat, Heuristic to detect logged-in state using config-driven text markers.         Ch, Generate random registration credentials for automation jobs., Generate more natural-looking credentials (used by WordPress SubmitPro)., Try multiple strategies to find the newly created story/article URL.         Use, Execute the full backlink creation flow.          Args:             client_site: (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (10): Supabase Service for Backlink Automation V1  Handles all database interactions w, Mark job as completed and store the created backlink URL in state., Handle failure + retry logic.         If retry_count < max_retries: set status b, Fetch a single job by id (useful for verification)., Return active target_sites rows where site_id has not been detected yet., Write the detected CMS template back to target_sites.site_id.          Args:, ISO format timestamp for updated_at., Fetch the oldest pending backlink job.         NOTE: Filters to type='backlink' (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (15): ACTION_TYPE_LABELS, ApprovalCard(), ApprovalCardProps, PromptInput(), PromptInputProps, cn(), formatRelativeTime(), getInitials() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (18): `app/api/chat/route.ts`, Assigning a user to a department (server-side), Code Changes (Already Applied), Creating a task_run scoped to a department, `department_members`, `departments`, Filtering tasks by department, How to Apply the Migration (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (16): AgencyMemory, ApprovalStatus, Backlink, BacklinkStatus, ClientMember, ClientMemory, Database, Department (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (12): ChatMessages(), ChatMessagesProps, PROMPT_MAPPING, renderMarkdown(), ToolStep, ChatWorkspace(), ChatWorkspaceProps, metadata (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (15): clear_cache(), _deep_merge(), _extract_domain(), load_config(), _load_json_file(), load_site_override(), load_template_config(), Config Loader for Backlink Automation  Loads template default configs and merges (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (24): Client, Exception, FailureHandler, Failure Handler for Backlink Automation  Responsibilities:     - Classify errors, Extract logs for the specific task run and upload to Supabase., Full failure handling pipeline:         1. Classify the error         2. Capture, Update site health on successful execution., Update target_sites health tracking columns.          On success:             - (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (14): 10. **Behavioral Stealth (Human-Like Patterns)**, 1. **Use CDP Mode (Not Just UC Mode)**, 2. **Use a Natural Browser Fingerprint**, 3. **Use CDP Methods for Actions (Not JavaScript)**, 4. **Use `sb.solve_captcha()` for Automatic Bypass**, 5. **Use PyAutoGUI for Physical Mouse/Keyboard Actions**, 6. **Use Xvfb on Linux (Never True Headless)**, 7. **Use Residential Proxies + IP Rotation** (+6 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (14): 1. Install Redis, 2. Configure for External Access & Security, 3. Open the Firewall, All VPS Workers (`playwright_automation/backlink_automation/.env`), 🏛 Architecture Overview, 📊 Monitoring the System, Multi-VPS Redis Queue Setup, Network Topology (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.19
Nodes (11): AutomationError, ConnectionTimeoutError, LoginFailedError, Typed Error Classes for Backlink Automation  Each error class represents a speci, Base error for all automation failures.          Attributes:         error_type:, Page load timed out after all retry attempts., A required DOM element could not be found.     This usually means the site chang, Login attempt failed — wrong credentials, account locked, etc. (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (13): Auth & Routing, Chat → Hermes Pipeline, Environment & Supabase Clients, Frontend ↔ Backend Configuration Audit, Gap 1 — `ChatWorkspace` does NOT pass `department` to Hermes, Gap 2 — `RunConfigurationPanel` does NOT set `department_id` on `task_runs`, Gap 3 — `ChatWorkspace` does NOT set `department_id` on `tasks` or `chat_messages`, ⚠️ Gaps Found — Frontend Not Yet Using Phase 2 Fields (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (11): CATEGORIES, SkillsPage(), Skill, getSkillsForStepType(), HermesSkill, SKILL_CATEGORY_COLORS, CATEGORIES, CATEGORY_CARD_STYLES (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (14): BaseTemplate, CaptchaFailedError, Account registration failed — duplicate user, blocked domain, etc., Captcha solving failed after all attempts., RegistrationFailedError, PliggGenericTemplate, Register a new account if not logged in., Solve SolveMedia captcha using 2Captcha service. All selectors from config. (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (8): Any, Execute the full automation flow for a site.          Args:             site_id:, Logger, log_event(), Logging Service for Backlink Automation Engine V1  Provides rotating file loggin, Setup rotating file logger with console output., Log a structured event with optional details., setup_logger()

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (11): 1. Database-Level Isolation, 2. Frontend Configuration (`ArticleRunConfigurationPanel.tsx`), 3. Backend Queuing (`app/api/campaigns/execute-articles/route.ts`), 4. Isolated Python Worker (`article_worker.py`), 5. Secure Proxies (`app/api/browser-use/profiles/route.ts`), Architectural Design, Article Submission Workflow Architecture, Environment Variables (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (11): 1. Architecture Overview, 2. Local Setup, 3. Automated VPS Deployment (`deploy.ps1`), 4. How to Set Up a Brand New VPS (From Scratch), Playwright Worker Setup & Deployment Guide, Step 1: Install Node.js, PM2, and Python Venv, Step 2: Install Google Chrome & Virtual Display (For SeleniumBase/Playwright), Step 3: Create the App Directory and Virtual Environment (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.35
Nodes (7): Site is unreachable — connection refused, DNS failure, or HTTP 5xx., Bookmark/article submission failed., SiteDownError, SubmissionFailedError, Page, Generic WordPress SubmitPro template.     Handles registration and bookmark subm, WordPressSubmitProTemplate

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): 1. Database Migration (Required), 2. Edge Function Update, 3. Install Dependencies, Backlink Automation System V2, 📂 Directory Structure, 🚨 Failure Handling & Health States, 🧱 How to Add a Completely New Template, 📖 How to Add a Site-Specific Override (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.19
Nodes (13): DashboardLayout(), metadata, ClientContext, ClientContextValue, ClientProvider(), useClient(), Client, WorkflowTemplate (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.19
Nodes (7): Template Detector (Playwright-based)  Replaces the Supabase Edge Function `detec, Inspect the raw HTML and return the matching template ID, or None if         no, Check if <meta name="generator"> content contains any of the keywords., Check if any <form> element has an action attribute matching path_segment., Navigates to a site URL using the stealth browser and fingerprints its CMS., Detect the CMS/template of a site by navigating to its homepage.          Args:, TemplateDetector

### Community 33 - "Community 33"
Cohesion: 0.20
Nodes (6): CaptchaService, Captcha Service - Reusable Abstraction for Backlink Automation V1  This service, Specific helper for SolveMedia (used on livebookmarking.com register).         I, Helper to detect if a captcha is visible on the current page.         Templates, Abstract captcha solver.      V1: Stub implementation only., Solve a captcha.          Args:             page: Playwright page object (for co

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (9): Adding and Formatting Proxies, Architecture Overview, Configuration Files, Health Check Logs, How It Works, Key Components:, Proxy Management System, Supported Formats (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (9): _build_registry(), _get_registry(), Template Runner for Backlink Automation  Centralized template resolution + confi, Resolves the correct template class + merged config for a given site,     then e, Return list of registered site_id values., Check if a site_id has a registered template., Build the template registry lazily to avoid circular imports.     Called once on, Get or build the template registry (cached). (+1 more)

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
Cohesion: 0.22
Nodes (6): TaskRunLog, SIMULATED_LOGS, STATUS_FILTERS, StatusFilter, TaskRunExtended, TasksPage()

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
Cohesion: 0.27
Nodes (7): getIcon(), getTheme(), TemplateNode(), TemplateNodeData, TemplateNodeType, nodeTypes, WorkflowVisualizerProps

### Community 94 - "Community 94"
Cohesion: 0.40
Nodes (4): 1. The "Permanently Pending" Bug (Read-After-Write Race Condition), 2. The 30-Second "Staggering" Bottleneck (Queue Freezing), 3. Artificial Global Rate Limiting, Redis Queue & Concurrency Troubleshooting Guide

### Community 95 - "Community 95"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 96 - "Community 96"
Cohesion: 0.27
Nodes (4): Database Schema Reference, Realtime Subscriptions, RLS Policy Summary, Table Summary

### Community 97 - "Community 97"
Cohesion: 0.25
Nodes (8): ✅ Already Supported in V1 (Unchanged), ✅ Fixed in Phase 2 (This Session), Gap Analysis Results, Phased Roadmap, Readiness Summary (Updated), ⚠️ Still Outstanding (Future Work), The Target Hierarchy, V1 Architecture → Agency OS Gap Analysis

### Community 98 - "Community 98"
Cohesion: 0.38
Nodes (3): fetchAdminStats(), updateAdminLimit(), ClientStats

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
Cohesion: 0.29
Nodes (7): Architecture Overview, Hermes - Agentic SEO Platform, Getting Started, Mission, Problem Statement, Strategic Objectives, Vision

### Community 106 - "Community 106"
Cohesion: 0.15
Nodes (6): ProxyManager, Returns all active cf_clearance cookies for a proxy, optionally scoped to a targ, Returns a consistent User-Agent for a given proxy to ensure cf_clearance, Stores a harvested cf_clearance cookie for future reuse., Invalidates the cookie when a block is detected., Attempts to find a working proxy by sequentially testing them.         Returns t

### Community 107 - "Community 107"
Cohesion: 0.17
Nodes (11): 1. The 3-Tier Bypass Strategy, 2. Proxy Strategy: DataImpulse Sticky Sessions, 3. Playwright Resource Optimization, 4. Fingerprint Spoofing & Stealth, Cloudflare Bypass & Stealth Architecture, Dynamic Credential Fallback (Resiliency), IP Whitelisting & Cost Reduction, Sticky Sessions via Port Ranges (+3 more)

### Community 111 - "Community 111"
Cohesion: 0.67
Nodes (3): Documents, Hermes Agency OS — Project Documentation, Quick Reference

## Knowledge Gaps
- **356 isolated node(s):** `Fingerprint Hardening (VPS/Docker Safe)`, `2. Active Defense Layer (Human-Mouse Emulation)`, `How it Works:`, `4. Failure Handling Strategy`, `Tier 0: The `cf_clearance` Cookie Pool (Passive Injection)` (+351 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Client` connect `Community 31` to `Community 0`, `Community 6`, `Community 12`, `Community 14`, `Community 17`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `route_and_execute()` connect `Community 17` to `Community 31`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `FailureHandler` connect `Community 17` to `Community 20`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `createServiceClient()` (e.g. with `DELETE()` and `DELETE()`) actually correct?**
  _`createServiceClient()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fingerprint Hardening (VPS/Docker Safe)`, `2. Active Defense Layer (Human-Mouse Emulation)`, `How it Works:` to the rest of the system?**
  _460 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06346153846153846 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._