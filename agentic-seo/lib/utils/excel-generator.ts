import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import type { TaskRun } from '@/lib/supabase/types'

export async function downloadCampaignExcelReport(task: TaskRun, activeClientName: string) {
  try {
    const supabase = createClient()
    const campaignId = (task.state as any)?.campaign_id

    if (!campaignId) {
      alert("No campaign ID found for this task run.")
      return
    }

    // Fetch all task runs in this campaign
    const { data: campaignTasks, error: tasksError } = await supabase
      .from('task_runs')
      .select('*')
      .eq('state->>campaign_id', campaignId)

    if (tasksError) throw tasksError

    // Fetch keywords from the database for mapping
    const clientId = (campaignTasks as any[])?.[0]?.state?.client_id;
    let keywordMap: Record<string, string> = {};
    
    if (clientId) {
      const { data: keywordsData } = await supabase
        .from('keywords')
        .select('keyword, landing_page')
        .eq('client_id', clientId);
        
      if (keywordsData) {
        keywordsData.forEach(k => {
          if ((k as any).landing_page) {
            keywordMap[(k as any).landing_page] = (k as any).keyword;
          }
        });
      }
    }

    // Fetch target sites data for DA, PA, SS
    const uniqueSourceUrls = [...new Set(campaignTasks.map(t => (t as any).state?.target_site).filter(Boolean))];
    let targetSitesMap: Record<string, { da: number | null, pa: number | null, spam_score: number | null }> = {};
    
    if (uniqueSourceUrls.length > 0) {
      const { data: targetSitesData } = await supabase
        .from('target_sites')
        .select('url, da, pa, spam_score')
        .in('url', uniqueSourceUrls);
        
      if (targetSitesData) {
        targetSitesData.forEach(site => {
          targetSitesMap[site.url] = {
            da: site.da,
            pa: site.pa,
            spam_score: site.spam_score
          };
        });
      }
    }

    // Prepare rows for Excel
    const rows = []

    for (const t of campaignTasks) {
      const state = (t as any).state || {}
      const targetUrl = state.client_target_url || 'N/A'
      const sourceUrl = state.target_site || 'N/A'
      const taskRunStatus = (t as any).status || 'pending'
      
      // Match the targetUrl with the keyword's landing_page
      const keyword = keywordMap[targetUrl] || state.keyword || 'N/A'
      
      // Fetch the verified backlink for this specific target and source
      const { data: backlinks, error: backlinksError } = await supabase
        .from('backlinks')
        .select('*')
        .eq('target_url', targetUrl)
        .eq('source_url', sourceUrl)
        .order('created_at', { ascending: false })
        .limit(1)

      if (backlinksError) {
        console.error("Failed to fetch backlink:", backlinksError)
      }

      let backlink = backlinks?.[0]
      let metadata = backlink?.metadata || {}
      
      // Fallback: Check task_run_logs if no backlink but task is completed
      if (!backlink && taskRunStatus === 'completed') {
        const { data: logs } = await supabase
          .from('task_run_logs')
          .select('metadata')
          .eq('task_run_id', (t as any).id)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          
        if (logs && logs.length > 0) {
          for (const log of logs) {
            const structuredData = (log.metadata as any)?.structured_data;
            if (structuredData && structuredData.live_url) {
              metadata = structuredData;
              break;
            }
          }
        }
      }
      
      const liveUrl = backlink?.result_url || metadata?.live_url || (taskRunStatus === 'failed' ? 'Failed to generate' : 'Pending/Not Found')
      const date = backlink ? new Date(backlink.created_at).toLocaleDateString() : new Date((t as any).created_at).toLocaleDateString()
      const title = metadata?.title || keyword || 'N/A'
      const finalStatus = backlink?.status === 'verified' ? 'success' : (taskRunStatus === 'completed' ? 'success' : taskRunStatus)

      const siteData = targetSitesMap[sourceUrl] || {}
      const da = siteData.da ?? state.min_da ?? 30
      const ss = siteData.spam_score ?? 0.01
      const pa = siteData.pa ?? 30

      rows.push({
        'DATE': date,
        'target': sourceUrl,
        'DA': da,
        'SS': ss,
        'PA': pa,
        'client-site': targetUrl,
        'TITLE': title,
        'STATUS': finalStatus,
        'RESULTS': liveUrl
      })
    }

    if (rows.length === 0) {
      alert("No data available for this campaign yet.")
      return
    }

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Backlinks Report")

    // Generate filename
    const filename = `Backlinks_Report_${activeClientName.replace(/\s+/g, '_')}_${campaignId.slice(0, 8)}.xlsx`

    // Trigger download
    XLSX.writeFile(workbook, filename)
    
  } catch (error) {
    console.error("Failed to generate Excel report:", error)
    alert("An error occurred while generating the Excel report.")
  }
}
