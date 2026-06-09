'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import ApprovalCard from '@/components/approvals/ApprovalCard'
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import type { Approval } from '@/lib/supabase/types'

export default function ApprovalsPage() {
  const supabase = createClient()
  const { activeClient } = useClient()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!activeClient) { setApprovals([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase
        .from('approvals')
        .select('*')
        .eq('client_id', activeClient.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setApprovals(data ?? [])
      setLoading(false)
    }
    load()
  }, [activeClient?.id])

  const handleDecision = async (id: string, decision: 'approved' | 'rejected', taskRunId?: string | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('approvals')
      .update({ status: decision, decided_by: user?.id ?? null, decided_at: new Date().toISOString() })
      .eq('id', id)
      
    if (decision === 'approved' && taskRunId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('task_runs')
        .update({ status: 'pending' })
        .eq('id', taskRunId)
    }

    setApprovals((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Approvals</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
            Actions requiring your review before execution
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-500">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No pending approvals</p>
            <p className="text-xs mt-1">All actions have been reviewed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onDecision={(id, decision) => handleDecision(id, decision, approval.task_run_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
