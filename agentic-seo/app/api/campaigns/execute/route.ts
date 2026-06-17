import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createClient } from '@/lib/supabase/server'

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
      targetSitesCount,
      clientTargetUrl,
      campaignName
    } = body

    if (!clientId || !templateId || !clientTargetUrl) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
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
    const sitesWithUsage = allTargetSites.map(s => ({
      ...s,
      usage_count: usageMap.get(s.url) || 0
    }))

    sitesWithUsage.sort((a, b) => {
      if (a.usage_count !== b.usage_count) {
        return a.usage_count - b.usage_count
      }
      return b.da - a.da
    })

    // 1d. Select the top N target sites
    const targetSites = sitesWithUsage.slice(0, targetSitesCount)

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
      })
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
        output: { campaign_id: campaign.id }
      })
      .select()
      .single()

    if (parentTaskError) throw parentTaskError

    // 3. Fetch keywords
    const { data: keywords, error: keywordsError } = await adminClient
      .from('keywords')
      .select('*')
      .eq('client_id', clientId)

    if (keywordsError) throw keywordsError

    const activeKeywords = keywords && keywords.length > 0 ? keywords : []
    
    if (activeKeywords.length === 0) {
        return NextResponse.json({ error: 'No keywords found for this client.' }, { status: 400 })
    }

    // 4. Prepare task_runs
    const taskRunsToInsert: any[] = []
    targetSites.forEach((site: any) => {
      activeKeywords.forEach((kw: any) => {
        taskRunsToInsert.push({
          client_id: clientId,
          department_id: departmentId || null,
          workflow_template_id: templateId,
          status: 'pending',
          current_step_index: 0,
          state: {
            campaign_id: campaign.id,
            task_id: parentTask.id,
            client_target_url: `https://${clientTargetUrl.trim()}`,
            target_site: site.url,
            category: submissionType,
            min_da: minDa,
            min_pa: minPa,
            max_spam_score: maxSpamScore,
            keyword: kw.keyword,
          }
        })
      })
    })

    // 5. Bulk insert task_runs
    const { data: insertedTaskRuns, error: taskRunsError } = await adminClient
      .from('task_runs')
      .insert(taskRunsToInsert)
      .select()

    if (taskRunsError) throw taskRunsError

    // 6. Update usage tracking
    try {
      const upsertUsageData = targetSites.map((s: any) => ({
        client_id: clientId,
        site_url: s.url,
        usage_count: s.usage_count + 1,
        last_used_at: new Date().toISOString()
      }))

      await adminClient
        .from('client_site_usage')
        .upsert(upsertUsageData, { onConflict: 'client_id, site_url' })
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
