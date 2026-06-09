'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import {
  CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Filter, ChevronDown, ChevronUp, Download, MonitorPlay
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { TaskRun, TaskRunLog } from '@/lib/supabase/types'
import { downloadCampaignExcelReport } from '@/lib/utils/excel-generator'
import AnimatedTerminal from '@/components/tasks/AnimatedTerminal'

type TaskRunExtended = TaskRun & { 
  workflow_templates?: { name: string } | null,
  is_simple_task?: boolean,
  output?: any,
  result?: any,
  payload?: any
}

const STATUS_FILTERS = ['all', 'running', 'pending', 'waiting_approval', 'completed', 'failed'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export default function TasksPage() {
  const supabase = createClient()
  const { activeClient } = useClient()
  const [tasks, setTasks] = useState<TaskRunExtended[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  
  // State for expanded tasks
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, TaskRunLog[]>>({})
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function load() {
      if (!activeClient) { setTasks([]); setLoading(false); return }
      setLoading(true)
      
      const query1 = supabase
        .from('task_runs')
        .select('*, workflow_templates(name)')
        .eq('client_id', activeClient.id)
        .order('created_at', { ascending: false })
        .limit(50)

      const query2 = supabase
        .from('tasks')
        .select('*')
        .eq('client_id', activeClient.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filter !== 'all') {
        query1.eq('status', filter)
        query2.eq('status', filter)
      }
      
      const [res1, res2] = await Promise.all([query1, query2])
      
      const runs = res1.data ?? []
      const simpleTasks = (res2.data ?? []).map((t: any) => ({
        id: t.id,
        status: t.status,
        created_at: t.created_at,
        current_step_index: 0,
        workflow_templates: { name: `Campaign Task: ${t.title || t.type}` },
        is_simple_task: true,
        payload: t.payload,
        result: t.result,
        output: t.output
      }))

      const combined = [...runs, ...simpleTasks].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      
      setTasks(combined as any)
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
    if (activeClient) {
      await downloadCampaignExcelReport(task, activeClient.name)
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

  const statusBadge = (status: string) => {
    const base = 'text-xs px-2 py-0.5 rounded-full font-medium'
    switch (status) {
      case 'running': return <span className={cn(base, 'bg-indigo-500/15 text-indigo-300')}>Running</span>
      case 'pending': return <span className={cn(base, 'bg-amber-500/15 text-amber-300')}>Pending</span>
      case 'waiting_approval': return <span className={cn(base, 'bg-amber-500/30 text-amber-400')}>Waiting Approval</span>
      case 'completed': return <span className={cn(base, 'bg-emerald-500/15 text-emerald-300')}>Completed</span>
      case 'failed': return <span className={cn(base, 'bg-red-500/15 text-red-300')}>Failed</span>
      default: return <span className={cn(base, 'bg-gray-400 dark:bg-gray-500/15 text-gray-700 dark:text-gray-300 capitalize')}>{status.replace('_', ' ')}</span>
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
                      ? 'bg-indigo-600 text-gray-900 dark:text-white'
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
                        {statusBadge(task.status)}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">
                        Currently at Step {task.current_step_index + 1}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5">{formatRelativeTime(task.created_at)}</p>
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
                        {task.status === 'completed' && (
                          <button
                            onClick={() => handleDownloadPDF(task)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded text-xs font-medium transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Report
                          </button>
                        )}
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
    </div>
  )
}
