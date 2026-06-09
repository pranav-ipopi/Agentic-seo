'use client'

import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Approval } from '@/lib/supabase/types'

const ACTION_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  publish_article: { label: 'Publish Article', icon: '📝' },
  send_outreach: { label: 'Send Outreach Emails', icon: '📧' },
  modify_metadata: { label: 'Modify Metadata', icon: '🏷️' },
  generate_disavow: { label: 'Generate Disavow File', icon: '🚫' },
  update_schema: { label: 'Update Schema Markup', icon: '🔧' },
  default: { label: 'Action Required', icon: '⚠️' },
}

interface ApprovalCardProps {
  approval: Approval
  onDecision: (id: string, decision: 'approved' | 'rejected') => void
}

export default function ApprovalCard({ approval, onDecision }: ApprovalCardProps) {
  const meta = ACTION_TYPE_LABELS[approval.action_type] ?? ACTION_TYPE_LABELS.default

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 animate-slide-in-right">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{meta.label}</div>
          {approval.description && (
            <div className="text-xs text-gray-400 dark:text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{approval.description}</div>
          )}
          <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500 dark:text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{formatRelativeTime(approval.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Payload preview */}
      {Object.keys(approval.payload).length > 0 && (
        <div className="mb-3 rounded-lg bg-white dark:bg-gray-900/60 border border-gray-300 dark:border-gray-700 p-2 text-xs font-mono text-gray-400 dark:text-gray-600 dark:text-gray-400 overflow-hidden max-h-20 overflow-y-auto">
          {JSON.stringify(approval.payload, null, 2)}
        </div>
      )}

      <div className="flex gap-2">
        <button
          id={`approve-${approval.id}`}
          onClick={() => onDecision(approval.id, 'approved')}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 text-xs font-medium rounded-lg transition-all"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approve
        </button>
        <button
          id={`reject-${approval.id}`}
          onClick={() => onDecision(approval.id, 'rejected')}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 hover:border-red-500/50 text-red-400 text-xs font-medium rounded-lg transition-all"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    </div>
  )
}
