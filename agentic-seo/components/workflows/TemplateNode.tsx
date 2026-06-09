'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps, type Node } from '@xyflow/react'
import { Sparkles, CheckSquare, Settings2, Globe, Network, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TemplateNodeData = {
  name: string
  type: string
  skill?: string
  index: number
  isSelected?: boolean
  assignedSkillName?: string
}

export type TemplateNodeType = Node<TemplateNodeData, 'template'>

const getIcon = (type: string) => {
  switch (type) {
    case 'hermes_task': return Sparkles
    case 'approval': return CheckSquare
    case 'browser_use_task': return Globe
    default: return Settings2
  }
}

const getTheme = (type: string) => {
  switch (type) {
    case 'hermes_task': return {
      card: 'border-indigo-500/40 text-indigo-400',
      icon: 'from-indigo-500/20 to-purple-500/20 border-indigo-500/40',
      glow: 'shadow-indigo-500/20',
      selected: 'border-indigo-400 ring-2 ring-indigo-500/40 shadow-indigo-500/30',
      badge: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
    }
    case 'approval': return {
      card: 'border-amber-500/40 text-amber-400',
      icon: 'from-amber-500/20 to-orange-500/20 border-amber-500/40',
      glow: 'shadow-amber-500/20',
      selected: 'border-amber-400 ring-2 ring-amber-500/40 shadow-amber-500/30',
      badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    }
    case 'browser_use_task': return {
      card: 'border-emerald-500/40 text-emerald-400',
      icon: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40',
      glow: 'shadow-emerald-500/20',
      selected: 'border-emerald-400 ring-2 ring-emerald-500/40 shadow-emerald-500/30',
      badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    }
    default: return {
      card: 'border-slate-600 text-slate-300',
      icon: 'from-slate-700/50 to-slate-800/50 border-slate-600',
      glow: 'shadow-slate-500/10',
      selected: 'border-slate-400 ring-2 ring-slate-500/40 shadow-slate-500/30',
      badge: 'bg-slate-700/30 border-slate-600 text-slate-400',
    }
  }
}

function TemplateNode({ data }: NodeProps<TemplateNodeType>) {
  const Icon = getIcon(data.type)
  const theme = getTheme(data.type)
  const isExecutable = data.type === 'hermes_task' || data.type === 'browser_use_task'

  return (
    <div
      className={cn(
        'relative min-w-[260px] rounded-xl bg-white dark:bg-gray-900 border backdrop-blur-sm transition-all duration-200 shadow-lg',
        theme.card,
        theme.glow,
        data.isSelected && theme.selected,
        isExecutable && 'cursor-pointer hover:brightness-110',
      )}
    >
      {/* Input handle — hidden on first node */}
      {data.index > 0 && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 border-2 border-gray-200 dark:border-gray-900 bg-gray-400 dark:bg-gray-500"
        />
      )}

      <div className="p-4 flex gap-3 items-start">
        {/* Icon */}
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br border flex-shrink-0',
          theme.icon
        )}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
            {data.name || 'Unnamed Step'}
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-600 dark:text-gray-400 mt-0.5 flex items-center gap-1 uppercase font-medium tracking-wide">
            <Network className="w-2.5 h-2.5" />
            {data.type.replaceAll('_', ' ')}
          </div>

          {/* Assigned skill badge */}
          {data.assignedSkillName && (
            <div className={cn(
              'mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border',
              theme.badge
            )}>
              <Zap className="w-2.5 h-2.5" />
              {data.assignedSkillName}
            </div>
          )}
        </div>

        {/* Selected indicator */}
        {data.isSelected && (
          <div className="w-2 h-2 rounded-full bg-current mt-1 flex-shrink-0 animate-pulse" />
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 border-gray-200 dark:border-gray-900 bg-gray-400 dark:bg-gray-500"
      />

      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent rounded-xl pointer-events-none" />
    </div>
  )
}

export default memo(TemplateNode)
