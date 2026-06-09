import { TaskRun, Keyword } from '@/lib/supabase/types'

export class WorkflowRunner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(supabaseClient: any) {
    this.supabase = supabaseClient
  }

  async executeStep(taskRunId: string) {
    console.warn(`[DEPRECATED] WorkflowRunner.executeStep is deprecated. Node-by-node execution is now natively handled by hermes_worker.py via polling.`)
    return

    // 1. Fetch task run with its template and client
    const { data: taskRun, error } = await this.supabase
      .from('task_runs')
      .select('*, workflow_templates(*), clients(*)')
      .eq('id', taskRunId)
      .single()

    if (error || !taskRun) throw new Error(`Task run not found: ${taskRunId}`)
    if (
      taskRun.status === 'completed' ||
      taskRun.status === 'failed' ||
      taskRun.status === 'waiting_approval'
    ) {
      console.log(`[WorkflowRunner] Task ${taskRunId} cannot be executed (status: ${taskRun.status})`)
      return
    }

    const template = taskRun.workflow_templates as any
    const steps = template.steps as any[]
    const currentIndex = taskRun.current_step_index
    const config = taskRun.state as Record<string, any>

    if (currentIndex >= steps.length) {
      // Workflow fully done
      await this.supabase.from('task_runs').update({ status: 'completed' }).eq('id', taskRunId)
      console.log(`[WorkflowRunner] Workflow ${taskRunId} completed all steps.`)
      return
    }

    const currentStep = steps[currentIndex]
    // Resolve effective skill — allow per-step override stored in config.skillOverrides
    const skillOverrides: Record<string, string> = config?.skillOverrides ?? {}
    const effectiveSkill = skillOverrides[String(currentIndex)] ?? currentStep.skill

    console.log(
      `[WorkflowRunner] Executing Step ${currentIndex}: "${currentStep.name}" ` +
      `(type: ${currentStep.type}, skill: ${effectiveSkill ?? 'none'})`
    )

    // 2. Fetch context keywords for this client
    const { data: keywords } = await this.supabase
      .from('keywords')
      .select('*')
      .eq('client_id', taskRun.client_id)

    // 3. Mark as running
    await this.supabase.from('task_runs').update({ status: 'running' }).eq('id', taskRunId)

    // 4. Dispatch by step type
    try {
      if (currentStep.type === 'hermes_task' || currentStep.type === 'browser_use_task') {
        await this.handleHermesExecution(taskRun, currentStep, effectiveSkill, keywords ?? [])
        await this.moveToNextStep(taskRunId, currentIndex)

      } else if (currentStep.type === 'approval') {
        // If the user opted out of human review, skip this gate
        if (config?.requireApproval === false) {
          console.log(`[WorkflowRunner] requireApproval=false — skipping approval step.`)
          await this.moveToNextStep(taskRunId, currentIndex)
          return
        }

        // Create an approval record linked to this task_run so the PATCH handler can resume it
        const { error: approvalErr } = await this.supabase.from('approvals').insert({
          client_id: taskRun.client_id,
          task_run_id: taskRunId,
          action_type: 'backlink_review',
          description: `Review backlink opportunities for "${(taskRun.clients as any)?.name}" before submission.`,
          payload: {
            step: currentStep.name,
            stepIndex: currentIndex,
            config,
          },
          status: 'pending',
        })

        if (approvalErr) {
          console.warn(`[WorkflowRunner] Could not create approval record:`, approvalErr.message)
        }

        // Pause execution
        await this.supabase
          .from('task_runs')
          .update({ status: 'waiting_approval' })
          .eq('id', taskRunId)

        console.log(`[WorkflowRunner] Execution paused — waiting for human approval.`)
        return
      }

    } catch (err: any) {
      console.error(`[WorkflowRunner] Step failed:`, err)
      await this.supabase.from('task_runs').update({ status: 'failed' }).eq('id', taskRunId)
    }
  }

  private async handleHermesExecution(
    taskRun: any,
    step: any,
    effectiveSkill: string | undefined,
    keywords: Keyword[]
  ) {
    const config = taskRun.state as Record<string, any>
    const hermesUrl = process.env.NEXT_PUBLIC_HERMES_URL || 'http://127.0.0.1:8642'
    const hermesKey = process.env.HERMES_API_KEY || ''
    const clientData = taskRun.clients as any
    const clientName = clientData?.name ?? 'Unknown Client'
    const clientDomain = clientData?.domain ?? 'Unknown Domain'

    /**
     * Hermes Skills are slash commands — invoking "/<skill-id> <context>"
     * in the user message triggers the skill via skill_view() automatically.
     * See: Hermes Skills System docs — "Using a Skill" section.
     */
    const systemPrompt = `You are an expert SEO specialist executing an automated backlink campaign workflow.

Client: ${clientName}
Client Domain: ${clientDomain}

Campaign Configuration:
  - Target Backlinks: ${config?.targetBacklinks ?? 0}
  - Minimum Domain Authority: ${config?.minDa ?? 0}
  - Submission Type: ${config?.submissionType ?? 'N/A'}

Target Keywords:
${(keywords ?? []).map(k => `  - "${k.keyword}" → ${k.landing_page}`).join('\n') || '  (no keywords configured)'}

Execute the following workflow step: ${step.name}
Return a structured summary of actions taken and results.`

    let userMessage = `Context: ${step.name} for ${clientName} (${clientDomain})\nTarget: ${config?.targetBacklinks ?? 0} backlinks (min DA ${config?.minDa ?? 0})`
    
    if (effectiveSkill) {
      userMessage = `/${effectiveSkill}\n\n${userMessage}\n(Suggestion: Please utilize this attached skill to accomplish the task)`
    } else {
      userMessage = `Execute: ${step.name}\n\n${userMessage}\n(No specific skill attached, please use your general capabilities to accomplish this step)`
    }

    console.log(
      `[WorkflowRunner] → Hermes (${hermesUrl}) | skill: ${effectiveSkill ?? 'none'} | step: "${step.name}"`
    )

    // Store a 'started' log so the UI shows immediate feedback
    await this.supabase.from('task_run_logs').insert({
      task_run_id: taskRun.id,
      step_index: taskRun.current_step_index ?? 0,
      role: 'system',
      message: `Starting execution of step: ${step.name}. The AI agent is currently processing this task and performing background research/actions. This can take several minutes...`,
      metadata: {
        step_name: step.name,
        status: 'running',
        monitor_view: step.type === 'browser_use_task' ? { placeholder: true, status: 'running' } : null
      }
    })

    try {
      const res = await fetch(`${hermesUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hermesKey}`,
        },
        body: JSON.stringify({
          model: 'hermes-agent',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMessage },
          ],
          stream: false,
        }),
      })

      if (!res.ok) {
        console.warn(`[WorkflowRunner] Hermes returned ${res.status} — simulating success for demo.`)
        await this.supabase.from('task_run_logs').insert({
          task_run_id: taskRun.id,
          step_index: taskRun.current_step_index ?? 0,
          role: 'assistant',
          message: `Received ${res.status} from Hermes API. Simulating step completion for demo purposes.\n\nActions Taken:\n- Simulated execution of "${step.name}".`,
          metadata: { step_name: step.name, status: 'simulated' }
        })
      } else {
        const data = await res.json().catch(() => null)
        const reply = data?.choices?.[0]?.message?.content
        if (reply) {
          console.log(`[WorkflowRunner] Hermes response snippet: ${reply.slice(0, 200)}...`)
          
          // Store response log in DB for UI
          await this.supabase.from('task_run_logs').insert({
            task_run_id: taskRun.id,
            step_index: taskRun.current_step_index ?? 0,
            role: 'assistant',
            message: reply,
            metadata: {
              step_name: step.name,
              monitor_view: step.type === 'browser_use_task' ? { placeholder: true, status: 'completed' } : null
            }
          })
        }
      }

    } catch (e: any) {
      console.warn(`[WorkflowRunner] Could not reach Hermes at ${hermesUrl}:`, e.name, e.message, e.cause)
      
      await this.supabase.from('task_run_logs').insert({
        task_run_id: taskRun.id,
        step_index: taskRun.current_step_index ?? 0,
        role: 'system',
        message: `Network error reaching Hermes (${e.name}: ${e.message}). Simulating step completion for demo purposes.`,
        metadata: { step_name: step.name, status: 'simulated' }
      })
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    console.log(`[WorkflowRunner] ✓ Step "${step.name}" complete.`)
  }

  /**
   * Advance to the next step and execute it directly (recursive call).
   * We use direct recursion instead of HTTP chaining because:
   *  1. HTTP chaining loses the service-role auth context (no cookies in server→server calls)
   *  2. The service-role client stored in `this.supabase` remains valid across all steps
   * Called by hermes/browser steps and by the approval resume handler.
   */
  async moveToNextStep(taskRunId: string, currentIndex: number) {
    const nextIndex = currentIndex + 1
    console.log(`[WorkflowRunner] Advancing task ${taskRunId} to step index ${nextIndex}`)

    await this.supabase
      .from('task_runs')
      .update({
        current_step_index: nextIndex,
        status: 'pending',
      })
      .eq('id', taskRunId)

    // Execute the next step in the same process context
    await this.executeStep(taskRunId)
  }
}
