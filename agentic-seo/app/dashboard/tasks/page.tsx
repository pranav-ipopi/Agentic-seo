'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import {
  CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Filter, ChevronDown, ChevronUp, Download, MonitorPlay, FileSpreadsheet
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { TaskRun, TaskRunLog } from '@/lib/supabase/types'
import { downloadCampaignExcelReport } from '@/lib/utils/excel-generator'
import AnimatedTerminal from '@/components/tasks/AnimatedTerminal'

type TaskRunExtended = TaskRun & { 
  workflow_templates?: { name: string } | null,
  profiles?: { id: string, full_name: string, avatar_url: string } | null,
  is_simple_task?: boolean,
  output?: any,
  result?: any,
  payload?: any
}

const STATUS_FILTERS = ['all', 'running', 'pending', 'completed', 'failed'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export default function TasksPage() {
  const supabase = createClient()
  const { activeClient } = useClient()
  const [tasks, setTasks] = useState<TaskRunExtended[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  // Cache task results per client+filter key to avoid loading flash on re-visit
  const tasksCache = useRef<Record<string, TaskRunExtended[]>>({})
  
  // State for expanded tasks
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, TaskRunLog[]>>({})
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({})
  const [taskToCancel, setTaskToCancel] = useState<string | null>(null)
  const [retryingTasks, setRetryingTasks] = useState<Record<string, boolean>>({})

  // State for download report
  const [groupRowCount, setGroupRowCount] = useState<string>("10")
  const [includeFailed, setIncludeFailed] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    async function load() {
      if (!activeClient) { setTasks([]); setLoading(false); return }

      const cacheKey = `${activeClient.id}_${filter}`

      // Show cached data immediately if available
      if (tasksCache.current[cacheKey]) {
        setTasks(tasksCache.current[cacheKey])
        setLoading(false)
      } else {
        setLoading(true)
      }

      const query = supabase
        .from('tasks')
        .select('*, profiles(id, full_name, avatar_url)')
        .eq('client_id', activeClient.id)
        .not('output->campaign_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filter !== 'all') {
        query.eq('status', filter)
      }
      
      const { data, error } = await query
      
      const formattedTasks = (data ?? []).map((t: any) => ({
        id: t.id,
        status: t.status,
        created_at: t.created_at,
        current_step_index: 0,
        workflow_templates: { name: `Campaign: ${t.title || t.type}` },
        profiles: t.profiles,
        is_simple_task: !t.output?.campaign_id,
        payload: t.payload,
        result: t.result,
        output: t.output,
        summary: t.result?.summary ?? null
      }))

      tasksCache.current[cacheKey] = formattedTasks as any
      setTasks(formattedTasks as any)
      setLoading(false)
    }
    load()
  }, [activeClient?.id, filter, supabase])

  // Setup realtime subscription for task_run_logs
  useEffect(() => {
    if (!activeClient || !expandedTaskId) return

    const channel = supabase
      .channel(`task_run_logs_${expandedTaskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_run_logs', filter: `task_run_id=eq.${expandedTaskId}` },
        (payload) => {
          setLogs((prev) => ({
            ...prev,
            [expandedTaskId]: [...(prev[expandedTaskId] || []), payload.new as TaskRunLog]
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeClient, expandedTaskId, supabase])

  const toggleExpand = async (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null)
      return
    }
    setExpandedTaskId(taskId)
    
    // Fetch logs if not already loaded
    if (!logs[taskId]) {
      setLoadingLogs((prev) => ({ ...prev, [taskId]: true }))
      
      const taskObj = tasks.find(t => t.id === taskId)
      
      if (taskObj?.output?.campaign_id) {
        // This is a Campaign Task containing multiple task_runs
        const { data: campaignRuns } = await supabase
          .from('task_runs')
          .select('*')
          .eq('state->>task_id', taskId)
          .order('created_at', { ascending: true })
          
        const generatedLogs = (campaignRuns || []).map((run: any, idx: number) => ({
          id: run.id,
          step_index: idx,
          role: 'system',
          message: `Keyword: ${run.state?.keyword}\nTarget Site: ${run.state?.target_site}\nStatus: ${run.status}`,
          created_at: run.created_at,
          metadata: { step_name: `Job: ${run.state?.target_site}` }
        }))
        setLogs((prev) => ({ ...prev, [taskId]: generatedLogs as any }))
        setLoadingLogs((prev) => ({ ...prev, [taskId]: false }))
        return
      }

      if (taskObj?.is_simple_task) {
        // Mock a log for the atomic task
        const logContent = {
          payload: taskObj.payload,
          result: taskObj.result,
          output: taskObj.output
        }
        setLogs((prev) => ({ ...prev, [taskId]: [{
          id: taskId,
          step_index: 0,
          role: 'system',
          message: JSON.stringify(logContent, null, 2),
          created_at: taskObj.created_at,
          metadata: { step_name: 'Task Details' }
        }] as any }))
        setLoadingLogs((prev) => ({ ...prev, [taskId]: false }))
        return
      }

      // Default fallback
      const { data } = await supabase
        .from('task_run_logs')
        .select('*')
        .eq('task_run_id', taskId)
        .order('created_at', { ascending: true })
      
      setLogs((prev) => ({ ...prev, [taskId]: data ?? [] }))
      setLoadingLogs((prev) => ({ ...prev, [taskId]: false }))
    }
  }

  const handleDownloadPDF = async (task: TaskRunExtended) => {
    if (!activeClient) return
    setIsDownloading(true)
    try {
      const rowCount = parseInt(groupRowCount) || 10
      await downloadCampaignExcelReport(task, activeClient.name, rowCount, includeFailed)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleCancelTask = async (taskId: string) => {
    // Optimistically update the UI
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed', result: { ...(t.result || {}), is_cancelled: true } } as any : t))
    setTaskToCancel(null)
    
    try {
      const res = await fetch('/api/tasks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Failed to cancel task on server:', res.status, errorText)
      }
    } catch (err) {
      console.error('Error cancelling task:', err)
    }
  }

  const handleRetryFailed = async (taskId: string) => {
    setRetryingTasks(prev => ({ ...prev, [taskId]: true }))
    try {
      const res = await fetch('/api/tasks/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Failed to retry tasks on server:', res.status, errorText)
      } else {
        // Optimistically update the UI
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return { 
              ...t, 
              status: 'pending',
              result: {
                ...(t.result || {}),
                summary: t.result?.summary ? { ...t.result.summary, failed: 0 } : undefined
              },
              summary: (t as any).summary ? { ...(t as any).summary, failed: 0 } : undefined
            } as any
          }
          return t
        }))
      }
    } catch (err) {
      console.error('Error retrying tasks:', err)
    } finally {
      setRetryingTasks(prev => ({ ...prev, [taskId]: false }))
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
      case 'pending': return <Clock className="w-4 h-4 text-amber-400" />
      case 'waiting_approval': return <RefreshCw className="w-4 h-4 text-amber-500" />
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />
      default: return <Clock className="w-4 h-4 text-gray-400 dark:text-gray-600 dark:text-gray-400" />
    }
  }

  const statusBadge = (task: TaskRunExtended) => {
    const base = 'text-xs px-2 py-0.5 rounded-full font-medium'
    const status = task.status
    const summary = (task as any).summary
    const isCancelled = task.result?.is_cancelled

    switch (status) {
      case 'running': return <span className={cn(base, 'bg-indigo-500/15 text-indigo-300')}>Running</span>
      case 'pending': return <span className={cn(base, 'bg-amber-500/15 text-amber-300')}>Pending</span>
      case 'waiting_approval': return <span className={cn(base, 'bg-amber-500/30 text-amber-400')}>Waiting Approval</span>
      case 'completed':
        if (summary) {
          // Show breakdown even if overall status is completed
          return (
            <span className={cn(base, summary.failed > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>
              {summary.succeeded} ✓&nbsp;&nbsp;{summary.failed} ✗
            </span>
          )
        }
        return <span className={cn(base, 'bg-emerald-500/15 text-emerald-300')}>Completed</span>
      case 'failed':
        if (isCancelled) {
          return <span className={cn(base, 'bg-gray-500/15 text-gray-400')}>Cancelled by User</span>
        }
        if (summary) {
          return (
            <span className={cn(base, 'bg-red-500/15 text-red-300')}>
              {summary.succeeded} ✓&nbsp;&nbsp;{summary.failed} ✗
            </span>
          )
        }
        return <span className={cn(base, 'bg-red-500/15 text-red-300')}>Failed</span>
      default: return <span className={cn(base, 'bg-gray-400 dark:bg-gray-500/15 text-gray-700 dark:text-gray-300 capitalize')}>{String(status).replace('_', ' ')}</span>
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tasks</h1>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
              {activeClient ? `${activeClient.name} — all agent tasks` : 'Select a client to view tasks'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-0.5 gap-0.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors',
                    filter === s
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  )}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No tasks found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const isExpanded = expandedTaskId === task.id
              const taskLogs = logs[task.id] || []
              const isLogsLoading = loadingLogs[task.id]

              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors overflow-hidden",
                    isExpanded ? "border-gray-300 dark:border-gray-700" : "hover:border-gray-300 dark:hover:border-gray-700"
                  )}
                >
                  <div 
                    className="p-4 flex items-start gap-3 cursor-pointer"
                    onClick={() => toggleExpand(task.id)}
                  >
                    <div className="mt-0.5">{statusIcon(task.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{task.workflow_templates?.name || 'Workflow Run'}</span>
                        {statusBadge(task)}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">
                        {(task as any).summary
                          ? `${(task as any).summary.succeeded} of ${(task as any).summary.total} sites succeeded · ${(task as any).summary.failed} failed`
                          : `Currently at Step ${task.current_step_index + 1}`
                        }
                      </p>
                      {task.status === 'running' && (
                        <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 mt-1">
                          {(() => {
                            const summary = (task as any).summary;
                            if (summary) {
                              const remaining = Math.max(0, summary.total - (summary.succeeded + summary.failed));
                              if (remaining > 0) {
                                // Read configurable metrics from environment variables
                                const concurrentTabs = Number(process.env.NEXT_PUBLIC_CONCURRENT_TABS || 4);
                                const timePerTask = Number(process.env.NEXT_PUBLIC_TIME_PER_TASK_MINS || 5);
                                const remainingBatches = Math.ceil(remaining / concurrentTabs);
                                const remainingMinutes = remainingBatches * timePerTask;
                                const completionDate = new Date(Date.now() + remainingMinutes * 60000);
                                const isToday = completionDate.toDateString() === new Date().toDateString();
                                const timeStr = completionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return `Estimated completion: ${isToday ? timeStr : completionDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + timeStr}`;
                              }
                            }
                            return 'Estimated completion: Shortly...';
                          })()}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <p className="text-xs text-gray-400 dark:text-gray-600">{formatRelativeTime(task.created_at)}</p>
                        {task.profiles && (
                          <>
                            <span className="text-gray-600 dark:text-gray-400 text-xs">•</span>
                            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                              {task.profiles.avatar_url ? (
                                <img src={task.profiles.avatar_url} alt="avatar" className="w-3.5 h-3.5 rounded-full object-cover" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                  <span className="text-[8px] font-bold text-indigo-400">{task.profiles.full_name?.charAt(0) || 'U'}</span>
                                </div>
                              )}
                              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                                {task.profiles.full_name || 'Unknown User'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-500 dark:text-gray-500">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4">
                      
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Execution Logs</h3>
                        <div className="flex items-center gap-2">
                          {!task.is_simple_task && (task as any).summary?.failed > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRetryFailed(task.id); }}
                              disabled={retryingTasks[task.id]}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20 rounded text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {retryingTasks[task.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              Retry Failed
                            </button>
                          )}
                          {(task.status === 'running' || task.status === 'pending' || task.status === 'waiting_approval') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setTaskToCancel(task.id); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded text-xs font-medium transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel Job
                            </button>
                          )}
                          {(task.status === 'completed' || (!task.is_simple_task && (task.status === 'running' || task.status === 'pending'))) && (
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={includeFailed}
                                  onChange={(e) => setIncludeFailed(e.target.checked)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-600"
                                />
                                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Include Failed</span>
                              </label>
                              <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Group By:</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={groupRowCount}
                                  onChange={(e) => setGroupRowCount(e.target.value)}
                                  className="w-12 text-xs bg-transparent border-none p-0 focus:ring-0 text-gray-900 dark:text-white"
                                  placeholder="Rows"
                                />
                              </div>
                              <button
                                onClick={() => handleDownloadPDF(task)}
                                disabled={isDownloading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Download Report
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {isLogsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 text-gray-500 dark:text-gray-500 animate-spin" />
                        </div>
                      ) : taskLogs.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 dark:text-gray-500 text-xs">
                          No background logs available yet.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {taskLogs.map((log, idx) => {
                            const metadata = (log.metadata as Record<string, any>) || {}
                            return (
                            <div key={log.id || idx} className="flex gap-3">
                              <div className="w-6 h-6 rounded bg-indigo-500/10 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-indigo-400">{log.step_index + 1}</span>
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                  {metadata.step_name || `Step ${log.step_index + 1}`}
                                  <span className="text-gray-400 dark:text-gray-600 font-normal ml-2">{formatRelativeTime(log.created_at)}</span>
                                </div>
                                
                                {/* Message Box */}
                                <div className="text-xs text-gray-400 dark:text-gray-600 dark:text-gray-400 bg-black/20 p-3 rounded-lg border border-gray-200 dark:border-gray-800/50 whitespace-pre-wrap">
                                  {String(log.message)}
                                </div>

                                {/* Monitor View Placeholder */}
                                {metadata.monitor_view && (
                                  <div className="mt-2 border border-indigo-500/20 bg-indigo-500/5 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2 text-indigo-400">
                                      <MonitorPlay className="w-4 h-4" />
                                      <span className="text-xs font-medium">Browser Automation View</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 ml-auto">
                                        {metadata.monitor_view.status === 'running' ? 'Live Stream' : 'Simulated'}
                                      </span>
                                    </div>
                                    <AnimatedTerminal isRunning={metadata.monitor_view.status === 'running'} />
                                  </div>
                                )}
                              </div>
                            </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {taskToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Cancel Job</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Are you sure you want to cancel this job? This action will mark the job as failed and stop any running background tasks.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setTaskToCancel(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => handleCancelTask(taskToCancel)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
