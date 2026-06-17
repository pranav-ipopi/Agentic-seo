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

    const currentResult = (task as any).result || {}
    const newResult = { ...currentResult, is_cancelled: true, error: 'Cancelled by user' }

    // Use service client to bypass RLS for the UPDATE operation
    const adminSupabase = createServiceClient()
    const { error: updateError } = await adminSupabase
      .from('tasks')
      .update({ status: 'failed', result: newResult, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
