# V1 Architecture → Agency OS Gap Analysis

This document compares the **original V1 codebase** against the **target multi-tenant, multi-department Agency OS** architecture.

**Status**: Phase 2 foundation changes have been implemented. See [departments_setup.md](./departments_setup.md) for migration details.

---

## The Target Hierarchy

```
Organization → Client → Department → Team → User → Agent → Task
```

From your previous architecture discussion:
```
Advaita (Agency)
└── ABC Plumbing (Client)
      ├── SEO Team
      │     ├── SEO Manager (dept_role: department_head)
      │     ├── AI Agent (Hermes)
      │     └── SEO Executive (dept_role: employee)
      ├── Execution Team
      │     ├── Social Media Manager
      │     ├── Content Writer
      │     └── Automation Agent
      └── Design Team
            ├── Designer
            └── Design Agent
```

---

## Gap Analysis Results

### ✅ Already Supported in V1 (Unchanged)

| Capability | Implementation |
|---|---|
| Multi-client isolation | `clients` + `client_members` + Supabase RLS |
| Multi-user access control | `profiles.role` + RLS policies |
| Human-in-the-loop approvals | `approvals` table with state machine |
| AI workflow automation | `workflow_templates` + `task_runs` + WorkflowRunner |
| Agent client isolation | `client_id` injected into every Hermes system prompt |
| Persistent memory | `client_memory` (per-client) + `agency_memory` (global) |
| Real-time updates | Supabase Realtime on tasks, approvals, chat_messages |
| SEO data layer | `keywords` + `backlinks` tables |

---

### ✅ Fixed in Phase 2 (This Session)

| Gap | Fix Applied |
|---|---|
| No `departments` table | Created in `007_departments_schema.sql` with 3 seed rows |
| No `department_members` table | Created with `dept_role` positional hierarchy |
| No `department_id` on core tables | Added nullable FK to `tasks`, `task_runs`, `approvals`, `chat_sessions`, `workflow_templates` |
| Hermes hardcoded as SEO agent | `buildClientSystemMessage()` now accepts `department` slug and injects correct persona |
| Chat API ignored department | `app/api/chat/route.ts` now reads and forwards `department` to Hermes |
| No TypeScript types for departments | `lib/supabase/types.ts` updated with `Department`, `DepartmentMember`, `DeptRole`, `DepartmentSlug`, `DEPARTMENT_SLUGS`, `DEPARTMENT_IDS` |

---

### ⚠️ Still Outstanding (Future Work)

| Gap | Priority | Notes |
|---|---|---|
| `profiles.role` still SEO-specific | Medium | Should migrate to generic positional roles in Phase 3. Requires a new migration and UI changes. |
| RLS policies not department-scoped | Medium | Current RLS only checks `client_id`. A full dept-scoped policy would filter by `department_id` in `department_members`. |
| No UI for department management | Low | No admin screen to assign users to departments. Currently done at DB level. |
| No agency analytics dashboard | Low | No cross-client, cross-department reporting layer |
| Execution department modules | Future | Social scheduler, content calendar, publishing queue |
| Design department modules | Future | Creative queue, brand assets, image generation |

---

## Readiness Summary (Updated)

| Feature | Status |
|---|---|
| Multi-client | ✅ Done |
| Multi-user | ✅ Done |
| Workflow engine | ✅ Done |
| HITL approvals | ✅ Done |
| Agent isolation by client | ✅ Done |
| SEO data layer | ✅ Done |
| **Department schema** | ✅ Done (Phase 2) |
| **Department membership** | ✅ Done (Phase 2) |
| **Department-scoped tasks** | ✅ Done (Phase 2, nullable FK) |
| **Department-aware Hermes** | ✅ Done (Phase 2) |
| Generic role hierarchy (positional) | ⚠️ Partial |
| Dept-scoped RLS policies | ⚠️ Future |
| Agency analytics dashboard | ❌ Not started |

---

## Phased Roadmap

```
Phase 1 (V1 — Current)
    ✅ Multi-client setup
    ✅ SEO Department: Backlink Workflow, Chat, Tasks, Approvals
    🔄 Completing SEO modules

Phase 2 (Foundation — Just Completed)
    ✅ departments + department_members tables
    ✅ department_id FK on all core tables
    ✅ Department-aware Hermes agent personas
    ✅ TypeScript types updated

Phase 3 (Scale — Next)
    □ Refactor profiles.role to positional hierarchy
    □ Department-scoped RLS policies
    □ Admin UI for department membership
    □ Execution Department modules

Phase 4 (Full Agency OS)
    □ Design Department modules
    □ Cross-department analytics dashboard
    □ Client portal (read-only reports view)
```
