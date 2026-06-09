# Frontend ↔ Backend Configuration Audit

**Date**: 2026-06-05
**Status**: Phase 1 (SEO) is fully functional. 3 gaps identified relating to the Phase 2 department setup.

---

## ✅ What Is Correctly Configured

### Environment & Supabase Clients
| Check | Status | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` set | ✅ | Points to correct project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` set | ✅ | Correct |
| `NEXT_PUBLIC_HERMES_URL` set | ✅ | `http://127.0.0.1:8642` |
| `HERMES_API_KEY` set | ✅ | |
| `lib/supabase/client.ts` typed with `Database` | ✅ | |
| `lib/supabase/server.ts` typed with `Database` | ✅ | |
| `middleware.ts` session refresh | ✅ | Wraps `updateSession` |

### Auth & Routing
| Check | Status |
|---|---|
| Dashboard layout has auth guard (`redirect('/login')`) | ✅ |
| `ClientProvider` wraps entire dashboard | ✅ |
| Active client persisted in `localStorage` | ✅ |
| All Supabase queries respect RLS (use anon key + cookies) | ✅ |

### Chat → Hermes Pipeline
| Check | Status |
|---|---|
| `ChatWorkspace` saves user messages to `chat_messages` | ✅ |
| `ChatWorkspace` saves assistant response to `chat_messages` | ✅ |
| `ChatWorkspace` creates `tasks` row per message (`status: running`) | ✅ |
| `ChatWorkspace` updates task to `completed` or `failed` | ✅ |
| `streamHermesChat()` streams SSE from `Hermes` | ✅ |
| Tool progress events parsed and shown | ✅ |

### Workflow Engine
| Check | Status |
|---|---|
| `RunConfigurationPanel` inserts `task_runs` row | ✅ |
| `RunConfigurationPanel` calls `POST /api/workflows/execute` | ✅ |
| `WorkflowRunner.executeStep()` reads `task_runs` correctly | ✅ |
| Approval steps pause to `waiting_approval` | ✅ |
| Step advancement triggers next step via self-HTTP call | ✅ |

### Realtime
| Check | Status |
|---|---|
| `RightSidebar` subscribes to `tasks` changes | ✅ |
| `RightSidebar` subscribes to `approvals` changes | ✅ |
| Approval decisions update DB correctly | ✅ |

---

## ⚠️ Gaps Found — Frontend Not Yet Using Phase 2 Fields

### Gap 1 — `ChatWorkspace` does NOT pass `department` to Hermes
**File**: [`components/chat/ChatWorkspace.tsx` L96-102](file:///c:/Users/HP/Documents/Agentic_SEO/agentic-seo/components/chat/ChatWorkspace.tsx#L96-L102)

```ts
// CURRENT — no department context
const stream = streamHermesChat({
  messages: hermesMessages,
  clientId: activeClient.id,
  clientName: activeClient.name,
  clientDomain: activeClient.domain,
  sessionId,
  // ❌ department is not passed → Hermes always acts as SEO agent
})
```

**Impact**: Even after Phase 2 is wired, the chat will always use the SEO persona. For Phase 1 this is fine — all chats are SEO. But this needs fixing before adding Execution/Design department chat.

**Fix needed**: Pass `department: 'seo'` (hardcoded for now, dynamic later):
```ts
const stream = streamHermesChat({
  ...
  department: session?.department_id ? 'seo' : 'seo', // will be dynamic in Phase 3
})
```

---

### Gap 2 — `RunConfigurationPanel` does NOT set `department_id` on `task_runs`
**File**: [`components/workflows/RunConfigurationPanel.tsx` L43-53](file:///c:/Users/HP/Documents/Agentic_SEO/agentic-seo/components/workflows/RunConfigurationPanel.tsx#L43-L53)

```ts
// CURRENT — no department_id
await supabase.from('task_runs').insert({
  client_id: selectedClient,
  workflow_template_id: template.id,
  status: 'pending',
  current_step_index: 0,
  state: config,
  // ❌ department_id is not set → task run is not department-scoped
})
```

**Impact**: All task runs have `department_id = NULL`. The backfill in the migration handled the existing workflow template, but new runs need this set.

**Fix needed**: Read `department_id` from the template and forward it:
```ts
await supabase.from('task_runs').insert({
  client_id: selectedClient,
  workflow_template_id: template.id,
  department_id: template.department_id,  // ← add this
  ...
})
```

---

### Gap 3 — `ChatWorkspace` does NOT set `department_id` on `tasks` or `chat_messages`
**File**: [`components/chat/ChatWorkspace.tsx` L74-84](file:///c:/Users/HP/Documents/Agentic_SEO/agentic-seo/components/chat/ChatWorkspace.tsx#L74-L84)

When a chat message creates a `tasks` row, the `department_id` is not set. This means tasks created via chat are all unscoped.

**Fix needed**: Pass `department_id: DEPARTMENT_IDS.SEO` until dynamic department context is in place.

---

## Minor Observations (Non-Breaking)

| Item | Notes |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` not in `.env.local` | `createServiceClient()` in `server.ts` exists but would fail if called. Only `createClient()` (anon) is used currently — OK for Phase 1. |
| `NEXT_PUBLIC_HERMES_ADVANCED_UI_URL` missing from `.env.local` | Referenced in `docker-compose.yml` but not used in code currently — OK. |
| `as any` casts in several places | Several components cast the Supabase client `as any` to avoid TS errors. This is safe but should be cleaned up — the `Database` types are now fully correct. |
| No `NEXT_PUBLIC_SITE_URL` in `.env.local` | `WorkflowRunner` uses this for recursive step execution. Without it, the runner falls back to direct `executeStep()` which risks timeout on long workflows. Should add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for dev. |

---

## Summary

| Area | Status |
|---|---|
| Auth & sessions | ✅ Fully working |
| Supabase client setup | ✅ Fully typed and correct |
| Chat → Hermes pipeline | ✅ Working (SEO dept only) |
| Workflow engine | ✅ Working end-to-end |
| Realtime subscriptions | ✅ Working |
| `department_id` on `task_runs` | ❌ Not set in UI |
| `department_id` on `tasks` | ❌ Not set in UI |
| `department` passed to Hermes | ❌ Not passed in `ChatWorkspace` |
| `NEXT_PUBLIC_SITE_URL` missing | ⚠️ Workflow step chaining may fall back to direct call |
