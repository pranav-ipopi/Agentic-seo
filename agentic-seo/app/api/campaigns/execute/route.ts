import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createClient } from '@/lib/supabase/server'
import Redis from 'ioredis'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = user.id

    const adminClient = createServiceClient()
    const body = await request.json()
    
    const { 
      clientId, 
      clientName,
      templateId, 
      templateName,
      departmentId,
      submissionType, 
      minDa, 
      minPa, 
      maxSpamScore, 
      targets,
      campaignName
    } = body

    if (!clientId || !templateId || !targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: 'Missing required parameters or targets array' }, { status: 400 })
    }

    if (!process.env.REDIS_URL) {
      console.error('[CRITICAL ERROR] REDIS_URL environment variable is missing. Campaign execution aborted to prevent silent queue failure.')
      return NextResponse.json({ error: 'System Configuration Error: REDIS_URL is not set. Please add it to your Vercel environment variables.' }, { status: 500 })
    }

    // 1. Fetch available target sites from inventory
    const { data: allTargetSites, error: sitesError } = await adminClient
      .from('target_sites')
      .select('url, da')
      .eq('category', submissionType)
      .gte('da', minDa)
      .gte('pa', minPa)
      .lte('spam_score', maxSpamScore)

    if (sitesError) throw sitesError

    if (!allTargetSites || allTargetSites.length === 0) {
      return NextResponse.json({ error: 'No target sites found matching your criteria.' }, { status: 400 })
    }

    // 1b. Fetch usage tracking for this client
    const { data: usageData, error: usageError } = await adminClient
      .from('client_site_usage')
      .select('site_url, usage_count')
      .eq('client_id', clientId)

    const usageMap = new Map()
    if (usageData) {
      usageData.forEach((u: any) => usageMap.set(u.site_url, u.usage_count))
    }

    // 1c. Merge usage counts and Sort
    const sitesWithUsage = allTargetSites.map((s: any) => ({
      ...s,
      usage_count: usageMap.get(s.url) || 0
    }))

    sitesWithUsage.sort((a, b) => {
      if (a.usage_count !== b.usage_count) {
        return a.usage_count - b.usage_count
      }
      return b.da - a.da
    })

    // We don't slice targetSites globally anymore, we do it per target later.

    // --- NEW: Limit Check ---
    let totalTasksToRun = 0
    for (const target of targets) {
      if (!target.clientTargetUrl || !target.keywords || target.keywords.length === 0) continue
      const targetSpecificSites = sitesWithUsage.slice(0, target.targetSitesCount || 0)
      totalTasksToRun += targetSpecificSites.length * target.keywords.length
    }

    if (totalTasksToRun === 0) {
      return NextResponse.json({ error: 'No task runs generated. Check targets and keywords.' }, { status: 400 })
    }

    const { data: clientData, error: clientError } = await adminClient
      .from('clients')
      .select('backlink_limit')
      .eq('id', clientId)
      .single()

    if (clientError) throw clientError

    if (clientData?.backlink_limit !== null && clientData?.backlink_limit !== undefined) {
      const limit = clientData.backlink_limit
      
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const startOfDay = today.toISOString()

      const { count, error: countError } = await adminClient
        .from('task_runs')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .neq('status', 'failed')
        .eq('type', 'backlink')
        .gte('created_at', startOfDay)

      if (countError) throw countError

      const used = count || 0
      const remaining = Math.max(0, limit - used)

      if (totalTasksToRun > remaining) {
        return NextResponse.json({ 
          error: `Daily backlink limit exceeded. You have ${remaining} backlink(s) remaining for today, but attempted to queue ${totalTasksToRun}.` 
        }, { status: 403 })
      }
    }
    // --- END Limit Check ---

    // 2. Create the parent Campaign
    const finalCampaignName = campaignName || `${templateName} for ${clientName} (${submissionType})`
    const { data: campaign, error: campaignError } = await adminClient
      .from('campaigns')
      .insert({
        client_id: clientId,
        department_id: departmentId || null,
        name: finalCampaignName,
        type: 'backlink_campaign',
        status: 'running',
        created_by: userId,
      } as any)
      .select()
      .single()

    if (campaignError) throw campaignError

    // 2b. Create the parent Task for the UI
    const { data: parentTask, error: parentTaskError } = await adminClient
      .from('tasks')
      .insert({
        client_id: clientId,
        department_id: departmentId || null,
        user_id: userId,
        title: finalCampaignName,
        status: 'pending',
        output: { campaign_id: (campaign as any).id }
      } as any)
      .select()
      .single()

    if (parentTaskError) throw parentTaskError

    // 3. Prepare task_runs
    const taskRunsToInsert: any[] = []
    
    for (const target of targets) {
      const { clientTargetUrl, targetSitesCount, keywords } = target
      
      if (!clientTargetUrl || !keywords || keywords.length === 0) continue
      
      const targetSpecificSites = sitesWithUsage.slice(0, targetSitesCount || 0)
      
      targetSpecificSites.forEach((site: any) => {
        keywords.forEach((kwStr: string) => {
          taskRunsToInsert.push({
            client_id: clientId,
            department_id: departmentId || null,
            workflow_template_id: templateId,
            status: 'pending',
            current_step_index: 0,
            state: {
              campaign_id: (campaign as any).id,
              task_id: (parentTask as any).id,
              client_target_url: clientTargetUrl.startsWith('http') ? clientTargetUrl.trim() : `https://${clientTargetUrl.trim()}`,
              target_site: site.url,
              category: submissionType,
              min_da: minDa,
              min_pa: minPa,
              max_spam_score: maxSpamScore,
              keyword: kwStr,
            }
          })
        })
      })
    }
    
    if (taskRunsToInsert.length === 0) {
      return NextResponse.json({ error: 'No task runs generated. Check targets and keywords.' }, { status: 400 })
    }

    // 5. Bulk insert task_runs
    const { data: insertedTaskRuns, error: taskRunsError } = await adminClient
      .from('task_runs')
      .insert(taskRunsToInsert as any)
      .select()

    if (taskRunsError) throw taskRunsError

    // Fetch template once to attach to Redis jobs
    const { data: workflowTemplate } = await adminClient
      .from('workflow_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    // 5b. Push jobs to Redis queue for workers
    if (insertedTaskRuns && insertedTaskRuns.length > 0) {
      if (process.env.REDIS_URL) {
        try {
          const redis = new Redis(process.env.REDIS_URL)
          const pipeline = redis.pipeline()
          // Ensure we push jobs using the exact same structure the worker expects
          insertedTaskRuns.forEach((run: any) => {
            const redisJob = {
              ...run,
              workflow_templates: workflowTemplate || null
            }
            pipeline.lpush('backlink_queue', JSON.stringify(redisJob))
          })
          await pipeline.exec()
          await redis.quit()
          console.log(`Pushed ${insertedTaskRuns.length} jobs to Redis backlink_queue`)
        } catch (redisError) {
          console.error('Failed to push jobs to Redis queue:', redisError)
          // We don't throw here to ensure the campaign still registers as created
        }
      } else {
        console.warn('REDIS_URL is not set. Jobs created in Supabase but not pushed to Redis queue.')
      }
    }

    // 6. Update usage tracking
    try {
      const allSitesUsed = new Set<string>()
      targets.forEach((t: any) => {
        const sites = sitesWithUsage.slice(0, t.targetSitesCount || 0)
        sites.forEach((s: any) => allSitesUsed.add(s.url))
      })

      const upsertUsageData = Array.from(allSitesUsed).map(url => {
        const siteData = sitesWithUsage.find((s: any) => s.url === url)
        return {
          client_id: clientId,
          site_url: url,
          usage_count: (siteData?.usage_count || 0) + 1,
          last_used_at: new Date().toISOString()
        }
      })

      await adminClient
        .from('client_site_usage')
        .upsert(upsertUsageData as any, { onConflict: 'client_id, site_url' })
    } catch (err) {
      console.warn('Failed to update site usage tracking', err)
    }

    return NextResponse.json({ 
        success: true, 
        queuedRunsCount: taskRunsToInsert.length 
    })
  } catch (error: any) {
    console.error('Execution Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
