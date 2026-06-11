import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { WorkflowRunner } from '@/lib/workflows/runner'

export async function POST(request: Request) {
  try {
    const { taskRunId } = await request.json()

    if (!taskRunId) {
      return NextResponse.json({ error: 'Missing taskRunId' }, { status: 400 })
    }

    // Use the service-role client so the runner can read/write task_runs
    // regardless of the calling user's session. The runner is an internal
    // system process — it must bypass RLS to manage workflow state.
    //
    // NOTE: requires SUPABASE_SERVICE_ROLE_KEY in .env.local
    const supabase = createServiceClient()
    const runner = new WorkflowRunner(supabase)

    // Run asynchronously — fire and forget so the API returns immediately.
    // [DISABLED] Node-by-node execution is now handled by vps_worker_playwright.py via polling.
    // runner.executeStep(taskRunId).catch((err) => {
    //   console.error('[API Execute Route] Async Execution Error:', err)
    // })

    return NextResponse.json({ success: true, message: 'Execution started', taskRunId })
  } catch (error: any) {
    console.error('[API Execute Route] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
