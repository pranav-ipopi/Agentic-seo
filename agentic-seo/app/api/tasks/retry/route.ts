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
      .select('id, result')
      .eq('id', taskId)
      .single()

    if (fetchError || !task) {
      return NextResponse.json({ error: 'Task not found or unauthorized' }, { status: 403 })
    }

    const adminSupabase = createServiceClient()

    // 1. Update failed task_runs to pending
    const { error: runUpdateError } = await adminSupabase
      .from('task_runs')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('state->>task_id', taskId)
      .eq('status', 'failed')

    if (runUpdateError) {
      return NextResponse.json({ error: runUpdateError.message }, { status: 500 })
    }

    // 2. Also update the main task status to pending so the UI reflects it's active again
    const currentResult = (task as any).result || {}
    const newResult = { ...currentResult }
    delete newResult.is_cancelled
    if (newResult.summary) {
      newResult.summary.failed = 0
    }

    const { error: updateError } = await adminSupabase
      .from('tasks')
      .update({ status: 'pending', result: newResult, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
