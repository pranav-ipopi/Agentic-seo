import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { WorkflowRunner } from '@/lib/workflows/runner'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const status = searchParams.get('status') ?? 'pending'

  const query = supabase
    .from('approvals')
    .select('*')
    .eq('status', status as 'pending' | 'approved' | 'rejected')
    .order('created_at', { ascending: false })
  if (clientId) query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase.from('approvals').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const body = await request.json() as { status: 'approved' | 'rejected' }

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()

  // 1. Update the approval record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: approval, error } = await (supabase as any)
    .from('approvals')
    .update({
      status: body.status,
      decided_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. If approved and linked to a workflow task_run, resume execution
  if (body.status === 'approved' && approval?.task_run_id) {
    try {
      // Use service client so the runner can access task_runs bypassing RLS
      const serviceSupabase = createServiceClient()
      const runner = new WorkflowRunner(serviceSupabase)

      // Fetch the current step index from the task_run so we advance from the approval step
      const { data: taskRun } = await (serviceSupabase as any)
        .from('task_runs')
        .select('current_step_index, status')
        .eq('id', approval.task_run_id)
        .single() as { data: { current_step_index: number; status: string } | null }

      if (taskRun && taskRun.status === 'waiting_approval') {
        console.log(
          `[Approvals API] Resuming task_run ${approval.task_run_id} from step ${taskRun.current_step_index}`
        )
        
        // 1. Immediately transition to 'pending' so the worker picks it up
        await (serviceSupabase as any)
          .from('task_runs')
          .update({
            status: 'pending',
          })
          .eq('id', approval.task_run_id)

        // 2. Fire and forget the rest of the workflow execution
        runner.executeStep(approval.task_run_id)
          .catch(e => console.error('[Approvals API] Resume failed:', e))
      }
    } catch (resumeErr) {
      // Non-fatal: approval is already recorded; log but don't block the response
      console.error('[Approvals API] Could not resume workflow:', resumeErr)
    }
  }

  // 3. If linked to an atomic task instead of a task_run
  if (approval?.task_id) {
    try {
      const serviceSupabase = createServiceClient()
      if (body.status === 'approved') {
        await (serviceSupabase as any).from('tasks').update({ status: 'pending' }).eq('id', approval.task_id)
      } else if (body.status === 'rejected') {
        await (serviceSupabase as any).from('tasks').update({ status: 'failed', output: { message: 'Approval rejected' } }).eq('id', approval.task_id)
      }
    } catch (e) {
      console.error('[Approvals API] Could not update atomic task:', e)
    }
  }

  return NextResponse.json(approval)
}
