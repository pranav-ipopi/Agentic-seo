import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createClient } from '@/lib/supabase/server'

/**
 * POST /api/campaigns/execute-articles
 *
 * Creates an Article Submission campaign. For each platform × keyword combination,
 * inserts a task_run with type='article_submission' so the article_worker.py picks
 * it up — completely isolated from the backlink worker.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = user.id
    const adminClient = createServiceClient()

    // 2. Parse body
    const body = await request.json()
    const {
      clientId,
      clientName,
      templateId,
      templateName,
      departmentId,
      campaignName,
      clientTargetUrl,
      articleTitle,
      articleDescription,
      platforms,        // Array<{ id: string, name: string, url: string }>
      profileId,
      articlesPerDay,
    } = body

    // 3. Validate required fields
    if (!clientId || !templateId || !clientTargetUrl || !articleTitle || !profileId) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, templateId, clientTargetUrl, articleTitle, profileId' },
        { status: 400 }
      )
    }

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one article submission platform.' },
        { status: 400 }
      )
    }

    // 4. Fetch client keywords
    const { data: keywords, error: keywordsError } = await adminClient
      .from('keywords')
      .select('*')
      .eq('client_id', clientId)

    if (keywordsError) throw keywordsError

    if (!keywords || keywords.length === 0) {
      return NextResponse.json(
        { error: 'No keywords found for this client. Please add at least one keyword.' },
        { status: 400 }
      )
    }

    // 5. Create parent Campaign
    const finalCampaignName = campaignName?.trim() ||
      `Article Submission for ${clientName} (${new Date().toLocaleDateString()})`

    const { data: campaign, error: campaignError } = await adminClient
      .from('campaigns')
      .insert({
        client_id: clientId,
        department_id: departmentId || null,
        name: finalCampaignName,
        type: 'article_campaign',
        status: 'running',
        created_by: userId,
      } as any)
      .select()
      .single()

    if (campaignError) throw campaignError

    // 6. Create parent Task for UI tracking
    const { data: parentTask, error: parentTaskError } = await adminClient
      .from('tasks')
      .insert({
        client_id: clientId,
        department_id: departmentId || null,
        user_id: userId,
        title: finalCampaignName,
        status: 'pending',
        output: { campaign_id: (campaign as any).id, campaign_type: 'article_campaign' },
      } as any)
      .select()
      .single()

    if (parentTaskError) throw parentTaskError

    // 7. Build task_runs: platforms × keywords
    const taskRunsToInsert: any[] = []

    platforms.forEach((platform: { id: string; name: string; url: string }) => {
      keywords.forEach((kw: any) => {
        taskRunsToInsert.push({
          // ── Isolation field ── article_worker.py picks ONLY type='article_submission'
          // backlink workers filter to type='backlink', so they'll never see this row
          type: 'article_submission',
          client_id: clientId,
          department_id: departmentId || null,
          workflow_template_id: templateId,
          status: 'pending',
          current_step_index: 0,
          state: {
            campaign_id: (campaign as any).id,
            task_id: (parentTask as any).id,
            // BrowserUse config
            profile_id: profileId,
            // Article content (LLM generates body from these in article_worker.py)
            article_title: articleTitle.trim(),
            article_description: articleDescription?.trim() || '',
            keyword: kw.keyword,
            // Target
            client_target_url: clientTargetUrl.startsWith('http')
              ? clientTargetUrl.trim()
              : `https://${clientTargetUrl.trim()}`,
            // Platform
            platform_url: platform.url,
            platform_name: platform.name,
            platform_id: platform.id,
            // Rate limiting hint for article_worker
            articles_per_day: articlesPerDay ?? 5,
          },
        })
      })
    })

    // 8. Bulk insert task_runs
    const { error: taskRunsError } = await adminClient
      .from('task_runs')
      .insert(taskRunsToInsert as any)

    if (taskRunsError) throw taskRunsError

    return NextResponse.json({
      success: true,
      queuedRunsCount: taskRunsToInsert.length,
      campaignId: (campaign as any).id,
    })
  } catch (error: any) {
    console.error('[execute-articles] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
