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

    // Prepare rows for Excel
    const rows = []

    for (const t of campaignTasks) {
      const state = (t as any).state as any
      const targetUrl = state.client_target_url
      const sourceUrl = state.target_site
      
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
        continue
      }

      const backlink = backlinks?.[0]
      const metadata = backlink?.metadata || {}
      
      const liveUrl = backlink?.result_url || metadata?.live_url || "Pending/Not Found"
      const date = backlink ? new Date(backlink.created_at).toLocaleDateString() : new Date().toLocaleDateString()
      const title = metadata?.title || keyword || 'N/A'

      rows.push({
        'DATE': date,
        'target': sourceUrl,
        'DA': state.min_da || 30,
        'SS': 0.01,
        'PA': 30,
        'client-site': targetUrl,
        'TITLE': title,
        'STATUS': backlink?.status === 'verified' ? 'success' : (backlink?.status || 'pending'),
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
