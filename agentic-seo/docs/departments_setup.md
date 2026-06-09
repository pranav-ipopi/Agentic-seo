# Phase 2 — Multi-Department Setup Guide

## What Was Done

Migration `007_departments_schema.sql` implements the Agency OS department layer on top of the existing V1 schema. All changes are **additive and non-breaking**.

---

## How to Apply the Migration

Run this in your Supabase SQL editor or via the Supabase CLI:

```bash
# Via Supabase CLI (if linked)
supabase db push

# Or manually: paste the contents of this file into the SQL Editor in your Supabase dashboard
supabase/migrations/007_departments_schema.sql
```

---

## What the Migration Creates

### New Tables

#### `departments`
The 3 global agency departments, seeded automatically.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Fixed UUIDs for easy reference in code |
| `name` | TEXT | `SEO Department`, `Execution Department`, `Design Department` |
| `slug` | TEXT | `seo`, `execution`, `design` — used as the Hermes `department` param |
| `description` | TEXT | |
| `icon` | TEXT | Lucide icon name |
| `is_active` | BOOLEAN | Toggle departments on/off |

**Seeded rows:**

| Slug | Name | ID |
|---|---|---|
| `seo` | SEO Department | `aaaaaaaa-0001-0001-0001-000000000001` |
| `execution` | Execution Department | `aaaaaaaa-0002-0002-0002-000000000002` |
| `design` | Design Department | `aaaaaaaa-0003-0003-0003-000000000003` |

These IDs are also exported as `DEPARTMENT_IDS` in `lib/supabase/types.ts`.

---

#### `department_members`
Maps a user to a department within a specific client, with a positional role.

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID FK | References `profiles` |
| `department_id` | UUID FK | References `departments` |
| `client_id` | UUID FK | References `clients` |
| `dept_role` | TEXT | `department_head`, `team_lead`, `employee`, `client_viewer` |

**Unique constraint**: `(user_id, department_id, client_id)` — a user can only have one role per department per client.

---

### Modified Tables (Non-Breaking Additions)

All new columns are **nullable** — existing Phase 1 data is unaffected.

| Table | Column Added | Notes |
|---|---|---|
| `tasks` | `department_id` | NULL = legacy/unscoped SEO task |
| `task_runs` | `department_id` | NULL = legacy SEO workflow run |
| `approvals` | `department_id` | NULL = legacy SEO approval |
| `chat_sessions` | `department_id` | NULL = legacy SEO chat session |
| `workflow_templates` | `department_id` | Existing Backlink Campaign backfilled to SEO dept |

---

## Code Changes (Already Applied)

### `lib/supabase/types.ts`
- Added `Department` and `DepartmentMember` types
- Added `department_id` fields to `ChatSession`, `Task`, `TaskRun`, `Approval`, `WorkflowTemplate`
- Exported `DeptRole`, `DepartmentSlug`, `DEPARTMENT_SLUGS`, `DEPARTMENT_IDS`

### `lib/hermes/client.ts`
- Added `DEPARTMENT_PERSONAS` map (seo / execution / design)
- `buildClientSystemMessage()` now accepts `department?: string | null`
- Falls back to SEO persona if `department` is not provided (backwards compatible)

### `app/api/chat/route.ts`
- Reads `department` from request body
- Forwards it to `buildClientSystemMessage()`

---

## How to Use Departments in New Features

### Assigning a user to a department (server-side)
```typescript
import { DEPARTMENT_IDS } from '@/lib/supabase/types'

await supabase.from('department_members').insert({
  user_id: userId,
  client_id: clientId,
  department_id: DEPARTMENT_IDS.SEO,
  dept_role: 'employee',
})
```

### Filtering tasks by department
```typescript
import { DEPARTMENT_IDS } from '@/lib/supabase/types'

const { data } = await supabase
  .from('tasks')
  .select('*')
  .eq('client_id', clientId)
  .eq('department_id', DEPARTMENT_IDS.SEO)
```

### Starting a department-aware chat session
```typescript
import { streamHermesChat } from '@/lib/hermes/client'

for await (const chunk of streamHermesChat({
  messages,
  clientId,
  clientName,
  clientDomain,
  sessionId,
  department: 'seo',  // 'seo' | 'execution' | 'design'
})) {
  // ...
}
```

### Creating a task_run scoped to a department
```typescript
import { DEPARTMENT_IDS } from '@/lib/supabase/types'

await supabase.from('task_runs').insert({
  client_id: clientId,
  workflow_template_id: templateId,
  department_id: DEPARTMENT_IDS.SEO,
})
```

---

## RLS Notes

Current RLS policies check `client_id` via `client_members`. Department-level RLS (filtering by `department_id` in `department_members`) is a **Phase 3 enhancement** — it would allow a designer to only see Design tasks without seeing SEO tasks for the same client. For now, all members of a client can see all of that client's data regardless of department.
