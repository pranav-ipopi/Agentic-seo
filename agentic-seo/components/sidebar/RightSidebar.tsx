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
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Task, Approval, TaskRun } from '@/lib/supabase/types'
import ApprovalCard from '@/components/approvals/ApprovalCard'

type TaskRunExtended = TaskRun & { workflow_templates?: { name: string } | null, is_simple_task?: boolean }

export default function RightSidebar() {
  const supabase = createClient()
  const { activeClient } = useClient()
  const [taskRuns, setTaskRuns] = useState<TaskRunExtended[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [suggestions] = useState<string[]>([])
  const [realtimeOpen, setRealtimeOpen] = useState(true)
  const [approvalsOpen, setApprovalsOpen] = useState(true)

  const loadData = useCallback(async () => {
    if (!activeClient) return

    const [simpleTasksRes, approvalsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('client_id', activeClient.id)
        .in('status', ['running', 'pending', 'waiting_approval'])
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('approvals')
        .select('*')
        .eq('client_id', activeClient.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const simpleTasks = (simpleTasksRes.data ?? []).map((t: any) => ({
      ...t,
      workflow_templates: { name: `Campaign Task: ${t.title || t.type}` },
      is_simple_task: true,
    }))

    const combined = [...simpleTasks]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)

    setTaskRuns(combined as TaskRunExtended[])
    setApprovals(approvalsRes.data ?? [])
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

    const approvalsChannel = supabase
      .channel(`approvals-${activeClient.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals', filter: `client_id=eq.${activeClient.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setApprovals((prev) => [payload.new as Approval, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Approval
            if (updated.status !== 'pending') {
              setApprovals((prev) => prev.filter((a) => a.id !== updated.id))
            } else {
              setApprovals((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(simpleTasksChannel)
      supabase.removeChannel(approvalsChannel)
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

  const handleApprovalDecision = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await fetch(`/api/approvals?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision }),
      })
      setApprovals((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      console.error('Failed to submit approval decision:', err)
    }
  }

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-y-auto">
      {/* Realtime Activity */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setRealtimeOpen(!realtimeOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span>Realtime Activity</span>
          </div>
          {realtimeOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {realtimeOpen && (
          <div className="px-3 pb-3 space-y-2">
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
      {suggestions.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider">Suggestions</span>
          </div>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-left text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-750 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 transition-colors hover:border-indigo-500/50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Approvals */}
      <div className="flex-1">
        <button
          onClick={() => setApprovalsOpen(!approvalsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Approvals</span>
            {approvals.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                {approvals.length}
              </span>
            )}
          </div>
          {approvalsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {approvalsOpen && (
          <div className="px-3 pb-3 space-y-2">
            {approvals.length === 0 ? (
              <div className="text-center py-4 text-gray-400 dark:text-gray-600 text-xs">
                <CheckCircle className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                No pending approvals
              </div>
            ) : (
              approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onDecision={handleApprovalDecision}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
