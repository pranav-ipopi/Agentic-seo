import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { createClient } from '@/lib/supabase/client'
import type { TaskRun } from '@/lib/supabase/types'

export async function downloadCampaignExcelReport(
  task: TaskRun,
  activeClientName: string,
  groupRowCount: number = 10,
  includeFailed: boolean = false
) {
  try {
    const supabase = createClient()
    const campaignId = (task as any).state?.campaign_id || (task as any).output?.campaign_id

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
        targetSitesData.forEach((site: any) => {
          targetSitesMap[site.url] = {
            da: site.da,
            pa: site.pa,
            spam_score: site.spam_score
          };
        });
      }
    }

    // Prepare rows for Excel
    const rows: {
      keyword: string
      DATE: string
      SOURCE: string
      DA: number
      SS: number
      PA: number
      'TARGET URL': string
      TITLE: string
      STATUS: string
      RESULTS: string
    }[] = []

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

      let backlink = (backlinks as any)?.[0]
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
            const structuredData = ((log as any).metadata as any)?.structured_data;
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
      const finalStatus = backlink?.status === 'verified' ? 'Submitted' : (taskRunStatus === 'completed' ? 'Submitted' : taskRunStatus)

      if (['pending', 'running', 'waiting_approval'].includes(taskRunStatus)) {
        continue;
      }

      if (!includeFailed && (taskRunStatus === 'failed' || finalStatus === 'failed')) {
        continue;
      }

      const siteData = targetSitesMap[sourceUrl] || {}
      const da = siteData.da ?? state.min_da ?? 30
      const ss = siteData.spam_score ?? 0.01
      const pa = siteData.pa ?? 30

      rows.push({
        keyword,
        DATE: date,
        SOURCE: sourceUrl,
        DA: da,
        SS: ss,
        PA: pa,
        'TARGET URL': targetUrl,
        TITLE: title,
        STATUS: finalStatus,
        RESULTS: liveUrl
      })
    }

    if (rows.length === 0) {
      alert("No data available for this campaign yet.")
      return
    }

    // Group rows by keyword, then slice to groupRowCount per keyword
    const grouped: Record<string, typeof rows> = {}
    for (const row of rows) {
      if (!grouped[row.keyword]) grouped[row.keyword] = []
      grouped[row.keyword].push(row)
    }

    // Generate filename
    const filename = `Backlinks_Report_${activeClientName.replace(/\s+/g, '_')}_${campaignId.slice(0, 8)}.xlsx`

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Backlinks Report')

    // Column definitions (excluding internal 'keyword' field)
    const dataColumns = ['DATE', 'SOURCE', 'DA', 'SS', 'PA', 'TARGET URL', 'TITLE', 'STATUS', 'RESULTS'] as const
    const totalCols = dataColumns.length

    // ── Row 1: Client name header (merged across all columns, grey bg) ──
    worksheet.addRow([activeClientName, ...Array(totalCols - 1).fill('')])
    worksheet.mergeCells(1, 1, 1, totalCols)
    const clientHeaderCell = worksheet.getCell(1, 1)
    clientHeaderCell.value = activeClientName
    clientHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' } // Light grey
    }
    clientHeaderCell.font = {
      bold: true,
      size: 13,
      color: { argb: 'FF333333' }
    }
    clientHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.getRow(1).height = 22

    // ── Row 2: Column headers (yellow background, bold black) ──
    worksheet.addRow(dataColumns as unknown as string[])
    const headerRow = worksheet.getRow(2)
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow
      }
      cell.font = {
        color: { argb: 'FF000000' },
        bold: true
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    headerRow.height = 18

    // ── Data rows: grouped by keyword, with blank separator row between groups ──
    const keywords = Object.keys(grouped)

    for (let ki = 0; ki < keywords.length; ki++) {
      const kw = keywords[ki]
      // Slice to groupRowCount
      const kwRows = grouped[kw].slice(0, groupRowCount)

      for (let rIdx = 0; rIdx < kwRows.length; rIdx++) {
        const rowData = kwRows[rIdx]
        
        const rowArray = dataColumns.map(col => {
          // Only show DATE on the very first row of the keyword group
          if (col === 'DATE' && rIdx > 0) return ''
          return (rowData as Record<string, any>)[col]
        })

        const excelRow = worksheet.addRow(rowArray)
        // No fill / no stripe formatting for data rows
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'none'
          }
          cell.font = {}
          cell.border = {}
        })
      }

      // Blank separator row after each keyword group (except the last)
      if (ki < keywords.length - 1) {
        worksheet.addRow(Array(totalCols).fill(''))
      }
    }

    // ── Auto-fit columns ──
    worksheet.columns.forEach((column, colIdx) => {
      let maxLength = dataColumns[colIdx] ? dataColumns[colIdx].length : 10
      column?.eachCell?.({ includeEmpty: false }, cell => {
        const len = cell.value ? cell.value.toString().length : 0
        if (len > maxLength) maxLength = len
      })
      column.width = Math.min(Math.max(maxLength + 2, 10), 60)
    })

    // Trigger download
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, filename)
    
  } catch (error) {
    console.error("Failed to generate Excel report:", error)
    alert("An error occurred while generating the Excel report.")
  }
}
