import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const taskId = body.taskId

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
    }

    // Verify the user has access to the task
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('id, campaign_id')
      .eq('id', taskId)
      .single()

    if (fetchError || !task) {
      return NextResponse.json({ error: 'Task not found or unauthorized' }, { status: 403 })
    }

    const adminSupabase = createServiceClient()

    // 1. Delete associated task_runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: taskRuns } = await (adminSupabase as any)
      .from('task_runs')
      .select('id')
      .eq('state->>task_id', taskId)

    if (taskRuns && taskRuns.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskRunIds = taskRuns.map((r: any) => r.id)
      
      // Delete task_run_logs first just in case there's no cascade
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminSupabase as any)
        .from('task_run_logs')
        .delete()
        .in('task_run_id', taskRunIds)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminSupabase as any)
        .from('task_runs')
        .delete()
        .in('id', taskRunIds)
    }

    // 2. Delete the task
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (adminSupabase as any)
      .from('tasks')
      .delete()
      .eq('id', taskId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // 3. Delete the campaign if it exists
    if ((task as any).campaign_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminSupabase as any)
        .from('campaigns')
        .delete()
        .eq('id', (task as any).campaign_id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
