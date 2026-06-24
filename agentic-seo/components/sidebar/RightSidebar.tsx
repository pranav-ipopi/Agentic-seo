'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  X,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Task, TaskRun } from '@/lib/supabase/types'

type TaskRunExtended = TaskRun & { 
  workflow_templates?: { name: string } | null, 
  is_simple_task?: boolean,
  title?: string,
  user_id?: string,
  type?: string
}

export default function RightSidebar() {
  const router = useRouter()
  const supabase = createClient()
  const { activeClient, setActiveClient } = useClient()
  const [taskRuns, setTaskRuns] = useState<TaskRunExtended[]>([])
  const [suggestions] = useState<string[]>([])
  const [realtimeOpen, setRealtimeOpen] = useState(true)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [notifications, setNotifications] = useState<(TaskRunExtended & { toastId: string })[]>([])
  const [activeTab, setActiveTab] = useState<'all'|'running'|'completed'|'failed'|'pending'>('all')

  const [clientsCache, setClientsCache] = useState<Record<string, any>>({})
  const [profilesCache, setProfilesCache] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('clients').select('*').then(({ data }) => {
      if (data) setClientsCache(data.reduce((acc: any, c: any) => ({ ...acc, [c.id]: c }), {}))
    })
    supabase.from('profiles').select('id, full_name').then(({ data }) => {
      if (data) setProfilesCache(data.reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.full_name || 'System' }), {}))
    })
  }, [supabase])

  const removeNotification = useCallback((toastId: string) => {
    setNotifications((prev) => prev.filter((n) => n.toastId !== toastId))
  }, [])

  const addNotification = useCallback((task: TaskRunExtended) => {
    const toastId = Math.random().toString(36).substring(7)
    setNotifications((prev) => [{ ...task, toastId }, ...prev])
    setTimeout(() => {
      removeNotification(toastId)
    }, 4000)
  }, [removeNotification])

  const handleNotificationClick = useCallback((client_id: string) => {
    const client = clientsCache[client_id]
    if (client) {
      setActiveClient(client)
      router.push('/dashboard/tasks')
    }
  }, [clientsCache, setActiveClient, router])

  const loadData = useCallback(async () => {
    const simpleTasksRes = await supabase
      .from('tasks')
      .select('*')
      .in('status', ['running', 'pending', 'waiting_approval', 'completed', 'failed'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50)

    const simpleTasks = (simpleTasksRes.data ?? []).map((t: any) => ({
      ...t,
      workflow_templates: { name: `Campaign Task: ${t.title || t.type}` },
      is_simple_task: true,
    }))

    const combined = [...simpleTasks]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setTaskRuns(combined as TaskRunExtended[])
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const visibleTasks = taskRuns.filter(t => Date.now() - new Date(t.created_at).getTime() < 24 * 60 * 60 * 1000)

  // Supabase Realtime subscriptions
  useEffect(() => {
    const simpleTasksChannel = supabase
      .channel('tasks-global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (!['running', 'pending', 'waiting_approval', 'completed', 'failed'].includes(payload.new.status)) return
            const newTask = { ...payload.new, workflow_templates: { name: `Campaign Task: ${payload.new.title || payload.new.type}` }, is_simple_task: true } as any
            setTaskRuns((prev) => [newTask, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10))
          } else if (payload.eventType === 'UPDATE') {
            const newTask = payload.new as any;
            const isCompleted = newTask.status === 'completed';

            setTaskRuns((prev) => {
              const oldTask = prev.find(t => t.id === newTask.id);
              const wasCompleted = oldTask?.status === 'completed';

              if (isCompleted && !wasCompleted) {
                setTimeout(() => {
                  addNotification({
                    ...newTask,
                    workflow_templates: oldTask?.workflow_templates || { name: `Campaign Task: ${newTask.title || newTask.type}` },
                    is_simple_task: true
                  });
                }, 0);
              }

              if (!['running', 'pending', 'waiting_approval', 'completed', 'failed'].includes(newTask.status)) {
                return prev.filter((t) => t.id !== newTask.id)
              }

              if (oldTask) {
                return prev.map((t) => t.id === newTask.id ? { ...newTask, workflow_templates: t.workflow_templates, is_simple_task: true } as any : t)
              } else {
                const addedTask = { ...newTask, workflow_templates: { name: `Campaign Task: ${newTask.title || newTask.type}` }, is_simple_task: true } as any;
                return [addedTask, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10)
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
  }, [supabase])

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
      {/* Toast Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {notifications.length > 1 && (
            <div className="flex justify-end w-80 pointer-events-auto">
              <button onClick={() => setNotifications([])} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                Clear all
              </button>
            </div>
          )}
          {notifications.map((notif) => (
            <div
              key={notif.toastId}
              onClick={() => handleNotificationClick(notif.client_id)}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-lg p-3 w-80 flex items-start gap-3 pointer-events-auto transition-all animate-in slide-in-from-right-8 fade-in duration-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80"
            >
              <div className="shrink-0 mt-0.5">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Task Completed
                </p>
                <div className="flex flex-col gap-1.5 mt-0.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {notif.workflow_templates?.name || notif.title || notif.type || 'Workflow Run'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 truncate max-w-[120px]">
                      {clientsCache[notif.client_id]?.name || 'Unknown Client'}
                    </span>
                    {notif.user_id && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 truncate max-w-[100px]">
                        {profilesCache[notif.user_id] || 'System'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeNotification(notif.toastId); }}
                className="shrink-0 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Realtime Updates */}
      <div className={cn("border-b border-gray-200 dark:border-gray-800 flex flex-col", realtimeOpen ? "flex-1 min-h-0" : "")}>
        <button
          onClick={() => setRealtimeOpen(!realtimeOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span>Realtime Updates</span>
            <span className="text-[9px] font-medium bg-gray-100 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded normal-case tracking-normal">Last 24 hrs</span>
          </div>
          {realtimeOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {realtimeOpen && (
          <div className="px-3 pb-3 space-y-2 overflow-y-auto flex-1 flex flex-col min-h-0">
            {/* ponytail: [Tabs component] -> skipped: [Heavy Radix Tabs], add when [complex routing needed]. */}
            <div className="flex items-center pb-2 border-b border-gray-100 dark:border-gray-800/50 mb-2 shrink-0">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 pr-2">
                {['all', 'running', 'completed', 'failed', 'pending'].map((tab) => {
                  const hasItems = tab === 'all' ? visibleTasks.length > 0 : visibleTasks.some(t => t.status === tab);
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={cn(
                        "relative text-[10px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap",
                        activeTab === tab 
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      )}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {hasItems && <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto">
              {visibleTasks.filter(t => activeTab === 'all' || t.status === activeTab).length === 0 ? (
                <div className="text-center py-4 text-gray-400 dark:text-gray-600 text-xs">
                  <Activity className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                  No {activeTab !== 'all' ? activeTab : 'active'} tasks
                </div>
              ) : (
                visibleTasks.filter(t => activeTab === 'all' || t.status === activeTab).map((taskRun) => (
                <div
                  key={taskRun.id}
                  onClick={() => handleNotificationClick(taskRun.client_id)}
                  className={cn('rounded-lg border p-2.5 animate-fade-in cursor-pointer hover:opacity-80 transition-opacity', taskStatusColor(taskRun.status))}
                >
                  <div className="flex items-start gap-2">
                    {taskStatusIcon(taskRun.status)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                        {taskRun.workflow_templates?.name || 'Workflow Run'}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 truncate max-w-[80px]">
                          {clientsCache[taskRun.client_id]?.name || 'Unknown'}
                        </span>
                        {taskRun.user_id && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 truncate max-w-[80px]">
                            {profilesCache[taskRun.user_id] || 'System'}
                          </span>
                        )}
                        <span className="text-[9px] text-gray-500 dark:text-gray-500 ml-auto">{formatRelativeTime(taskRun.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            </div>
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

      {/* Beta Notification */}
      <div className="p-4 border-t border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/20 mt-auto shrink-0">
        <div className="flex items-start gap-2 text-orange-600 dark:text-orange-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-[11px] font-medium leading-relaxed">
            Beta Testing. If you have any improvement suggestions contact <span className="font-semibold">Pranav</span>
          </p>
        </div>
      </div>
    </aside>
  )
}
