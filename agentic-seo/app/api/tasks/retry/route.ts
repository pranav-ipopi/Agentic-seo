import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Redis from 'ioredis'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const taskId = body.taskId

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
    }

    if (!process.env.REDIS_URL) {
      console.error('[CRITICAL ERROR] REDIS_URL environment variable is missing. Task retry aborted to prevent silent queue failure.')
      return NextResponse.json({ error: 'System Configuration Error: REDIS_URL is not set. Please add it to your Vercel environment variables.' }, { status: 500 })
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

    // 1a. Fetch the runs we are about to retry so we can push them to Redis if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: runsToRetry } = await (adminSupabase as any)
      .from('task_runs')
      .select('*, workflow_templates(*)')
      .eq('state->>task_id', taskId)
      .eq('status', 'failed')

    // 1b. Update failed task_runs to pending and reset step index
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: runUpdateError } = await (adminSupabase as any)
      .from('task_runs')
      .update({ status: 'pending', current_step_index: 0, updated_at: new Date().toISOString() })
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (adminSupabase as any)
      .from('tasks')
      .update({ status: 'pending', result: newResult, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 3. Push new jobs (current_step_index === 0) to Redis
    if (runsToRetry && runsToRetry.length > 0 && process.env.REDIS_URL) {
      try {
        const redis = new Redis(process.env.REDIS_URL)
        const pipeline = redis.pipeline()
        let pushedCount = 0

        for (const run of runsToRetry) {
          // Push retried jobs to Redis and force step index to 0
          run.current_step_index = 0;
          pipeline.lpush('backlink_queue', JSON.stringify(run));
          pushedCount++;
        }

        if (pushedCount > 0) {
          await pipeline.exec()
        }
        await redis.quit()
        console.log(`Pushed ${pushedCount} retried jobs to Redis`)
      } catch (redisError) {
        console.error('Failed to push retried jobs to Redis:', redisError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
