'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  AlertTriangle,
  Bell,
  Info,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Task, TaskRun } from '@/lib/supabase/types'

type TaskRunExtended = TaskRun & { workflow_templates?: { name: string } | null, is_simple_task?: boolean }

export default function RightSidebar() {
  const supabase = createClient()
  const { activeClient } = useClient()
  const [taskRuns, setTaskRuns] = useState<TaskRunExtended[]>([])
  const [suggestions] = useState<string[]>([])
  const [realtimeOpen, setRealtimeOpen] = useState(true)
  const [suggestionsOpen, setSuggestionsOpen] = useState(true)
  const [updatesOpen, setUpdatesOpen] = useState(true)

  const loadData = useCallback(async () => {
    if (!activeClient) return

    const simpleTasksRes = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', activeClient.id)
        .in('status', ['running', 'pending', 'waiting_approval'])
        .order('created_at', { ascending: false })
        .limit(10)

    const simpleTasks = (simpleTasksRes.data ?? []).map((t: any) => ({
      ...t,
      workflow_templates: { name: `Campaign Task: ${t.title || t.type}` },
      is_simple_task: true,
    }))

    const combined = [...simpleTasks]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)

    setTaskRuns(combined as TaskRunExtended[])
  }, [activeClient?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Supabase Realtime subscriptions
  useEffect(() => {
    if (!activeClient) return

    const simpleTasksChannel = supabase
      .channel(`tasks-${activeClient.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `client_id=eq.${activeClient.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (!['running', 'pending', 'waiting_approval'].includes(payload.new.status)) return
            const newTask = { ...payload.new, workflow_templates: { name: `Campaign Task: ${payload.new.title || payload.new.type}` }, is_simple_task: true } as any
            setTaskRuns((prev) => [newTask, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10))
          } else if (payload.eventType === 'UPDATE') {
            setTaskRuns((prev) => {
              if (!['running', 'pending', 'waiting_approval'].includes(payload.new.status)) {
                return prev.filter((t) => t.id !== payload.new.id)
              }
              const exists = prev.some(t => t.id === payload.new.id)
              if (exists) {
                return prev.map((t) => t.id === payload.new.id ? { ...payload.new, workflow_templates: t.workflow_templates, is_simple_task: true } as any : t)
              } else {
                 const newTask = { ...payload.new, workflow_templates: { name: `Campaign Task: ${payload.new.title || payload.new.type}` }, is_simple_task: true } as any
                 return [newTask, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10)
              }
            })
          } else if (payload.eventType === 'DELETE') {
            setTaskRuns((prev) => prev.filter((t) => t.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(simpleTasksChannel)
    }
  }, [activeClient?.id])

  const taskStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
      case 'pending': return <Clock className="w-3.5 h-3.5 text-amber-400" />
      case 'waiting_approval': return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
      case 'completed': return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
      case 'failed': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      default: return <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 dark:text-gray-400" />
    }
  }

  const taskStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'border-indigo-500/30 bg-indigo-500/5'
      case 'pending': return 'border-amber-500/30 bg-amber-500/5'
      case 'waiting_approval': return 'border-amber-500/50 bg-amber-500/10'
      case 'completed': return 'border-emerald-500/30 bg-emerald-500/5'
      case 'failed': return 'border-red-500/30 bg-red-500/5'
      default: return 'border-gray-500/30 bg-gray-400 dark:bg-gray-500/5'
    }
  }

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      {/* Realtime Activity */}
      <div className={cn("border-b border-gray-200 dark:border-gray-800 flex flex-col", realtimeOpen ? "flex-1 min-h-0" : "")}>
        <button
          onClick={() => setRealtimeOpen(!realtimeOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span>Realtime Activity</span>
          </div>
          {realtimeOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {realtimeOpen && (
          <div className="px-3 pb-3 space-y-2 overflow-y-auto flex-1">
            {taskRuns.length === 0 ? (
              <div className="text-center py-4 text-gray-400 dark:text-gray-600 text-xs">
                <Activity className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                No active tasks
              </div>
            ) : (
              taskRuns.map((taskRun) => (
                <div
                  key={taskRun.id}
                  className={cn('rounded-lg border p-2.5 animate-fade-in', taskStatusColor(taskRun.status))}
                >
                  <div className="flex items-start gap-2">
                    {taskStatusIcon(taskRun.status)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                        {taskRun.workflow_templates?.name || 'Workflow Run'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{formatRelativeTime(taskRun.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className={cn("border-b border-gray-200 dark:border-gray-800 flex flex-col", suggestionsOpen ? "flex-1 min-h-0" : "")}>
        <button
          onClick={() => setSuggestionsOpen(!suggestionsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Suggestions</span>
          </div>
          {suggestionsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {suggestionsOpen && (
          <div className="px-3 pb-3 space-y-2 overflow-y-auto flex-1">
            {suggestions.length === 0 ? (
              <div className="text-center py-4 text-gray-400 dark:text-gray-600 text-xs">
                <Zap className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                No new suggestions
              </div>
            ) : (
              suggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-750 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 transition-colors hover:border-indigo-500/50"
                >
                  {s}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Updates */}
      <div className={cn("flex flex-col", updatesOpen ? "flex-1 min-h-0" : "")}>
        <button
          onClick={() => setUpdatesOpen(!updatesOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-blue-400" />
            <span>Updates</span>
          </div>
          {updatesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {updatesOpen && (
          <div className="px-3 pb-3 space-y-2 overflow-y-auto flex-1">
            <div className="text-center py-4 text-gray-400 dark:text-gray-600 text-xs">
              <Bell className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
              No new updates
            </div>
          </div>
        )}
      </div>

      {/* Beta Notification */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 mt-auto shrink-0">
        <div className="flex items-start gap-2 text-gray-400 dark:text-gray-500">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed">
            We're currently in beta testing. Some tasks may fail.
          </p>
        </div>
      </div>
    </aside>
  )
}
