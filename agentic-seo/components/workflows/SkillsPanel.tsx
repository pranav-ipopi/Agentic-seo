'use client'

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Zap, Check, MousePointerClick, X } from 'lucide-react'
import {
  getSkillsForStepType,
  HermesSkill,
} from '@/lib/workflows/skills'
import { cn } from '@/lib/utils'
import { Skill } from '@/lib/supabase/types'

// ── Category metadata ──────────────────────────────────────────────────────

type CategoryKey = HermesSkill['category']

const CATEGORIES: { key: CategoryKey | 'all'; label: string; emoji: string }[] = [
  { key: 'all',         label: 'All',          emoji: '⚡' },
  { key: 'research',    label: 'Research',     emoji: '🔍' },
  { key: 'analysis',    label: 'Analysis',     emoji: '📊' },
  { key: 'submission',  label: 'Submission',   emoji: '🌐' },
  { key: 'verification',label: 'Verification', emoji: '✅' },
  { key: 'reporting',   label: 'Reporting',    emoji: '📋' },
]

const CATEGORY_CARD_STYLES: Record<CategoryKey, {
  border: string; glow: string; badge: string; selected: string; dot: string
}> = {
  research:     {
    border:   'border-blue-500/20 hover:border-blue-400/50',
    glow:     'hover:shadow-blue-500/10 hover:shadow-lg',
    badge:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    selected: 'border-blue-400 shadow-blue-500/25 shadow-lg bg-blue-500/5',
    dot:      'bg-blue-400',
  },
  analysis:     {
    border:   'border-purple-500/20 hover:border-purple-400/50',
    glow:     'hover:shadow-purple-500/10 hover:shadow-lg',
    badge:    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    selected: 'border-purple-400 shadow-purple-500/25 shadow-lg bg-purple-500/5',
    dot:      'bg-purple-400',
  },
  submission:   {
    border:   'border-emerald-500/20 hover:border-emerald-400/50',
    glow:     'hover:shadow-emerald-500/10 hover:shadow-lg',
    badge:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    selected: 'border-emerald-400 shadow-emerald-500/25 shadow-lg bg-emerald-500/5',
    dot:      'bg-emerald-400',
  },
  verification: {
    border:   'border-amber-500/20 hover:border-amber-400/50',
    glow:     'hover:shadow-amber-500/10 hover:shadow-lg',
    badge:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    selected: 'border-amber-400 shadow-amber-500/25 shadow-lg bg-amber-500/5',
    dot:      'bg-amber-400',
  },
  reporting:    {
    border:   'border-sky-500/20 hover:border-sky-400/50',
    glow:     'hover:shadow-sky-500/10 hover:shadow-lg',
    badge:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
    selected: 'border-sky-400 shadow-sky-500/25 shadow-lg bg-sky-500/5',
    dot:      'bg-sky-400',
  },
}

// ── Skill Card ─────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: Skill
  isAssigned: boolean
  isNodeSelected: boolean
  onClick: () => void
}

function SkillCard({ skill, isAssigned, isNodeSelected, onClick }: SkillCardProps) {
  const styles = CATEGORY_CARD_STYLES[skill.category as CategoryKey] || CATEGORY_CARD_STYLES.research
  const cat = CATEGORIES.find(c => c.key === skill.category)

  return (
    <button
      onClick={onClick}
      disabled={!isNodeSelected}
      className={cn(
        'relative flex flex-col gap-1.5 p-2.5 rounded-lg bg-white dark:bg-gray-900 border text-left mb-2',
        'transition-all duration-200 w-full',
        isNodeSelected ? 'cursor-pointer' : 'cursor-default opacity-40',
        isAssigned
          ? styles.selected
          : cn(styles.border, isNodeSelected && styles.glow),
      )}
    >
      {/* Assigned checkmark */}
      {isAssigned && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 flex items-center justify-center">
          <Check className={cn('w-2.5 h-2.5', `text-${styles.dot.replace('bg-', '')}`)} />
        </span>
      )}

      {/* Category badge */}
      <div className="flex items-center gap-1">
        <span className="text-xs leading-none">{cat?.emoji}</span>
        <span className={cn(
          'text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border',
          styles.badge
        )}>
          {skill.category}
        </span>
      </div>

      {/* Name */}
      <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-snug">
        {skill.name}
      </div>

      {/* Description */}
      <div className="text-[10px] text-gray-500 dark:text-gray-500 leading-relaxed line-clamp-2">
        {skill.description}
      </div>

      {/* Slash command */}
      <div className="flex items-center gap-1 mt-1 pt-1.5 border-t border-gray-200 dark:border-gray-800">
        <Zap className="w-2.5 h-2.5 text-gray-400 dark:text-gray-600 flex-shrink-0" />
        <code className="text-[9px] text-gray-400 dark:text-gray-600 font-mono truncate">/{skill.skill_id}</code>
      </div>
    </button>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

interface SkillsPanelProps {
  steps: any[]
  selectedNodeIndex: number | null
  skillOverrides: Record<string, string>
  skills: Skill[]
  onSkillSelect: (stepIndex: number, skillId: string) => void
  onSkillClear: (stepIndex: number) => void
}

export default function SkillsPanel({
  steps,
  selectedNodeIndex,
  skillOverrides,
  skills,
  onSkillSelect,
  onSkillClear,
}: SkillsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey | 'all'>('all')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const selectedStep = selectedNodeIndex !== null ? steps[selectedNodeIndex] : null
  const isExecutable =
    selectedStep?.type === 'hermes_task' || selectedStep?.type === 'browser_use_task'

  // Skills available for the selected node (filtered by type compatibility)
  const compatibleSkills = useMemo(() => {
    if (!selectedStep || !isExecutable) return skills
    // We map Skill to HermesSkill shape for getSkillsForStepType or just filter directly
    return skills.filter(s => s.compatible_types?.includes(selectedStep.type))
  }, [selectedStep, isExecutable, skills])

  // Filter by active category tab
  const displayedSkills = useMemo(() => {
    if (activeCategory === 'all') return compatibleSkills
    return compatibleSkills.filter(s => s.category === activeCategory)
  }, [compatibleSkills, activeCategory])

  // Categories that exist for this node's skills
  const availableCategories = useMemo(() => {
    const cats = new Set(compatibleSkills.map(s => s.category))
    return CATEGORIES.filter(c => c.key === 'all' || cats.has(c.key as CategoryKey))
  }, [compatibleSkills])

  const currentAssignment =
    selectedNodeIndex !== null ? skillOverrides[String(selectedNodeIndex)] : undefined

  const handleCardClick = (skill: Skill) => {
    if (selectedNodeIndex === null || !isExecutable) return
    if (currentAssignment === skill.skill_id) {
      onSkillClear(selectedNodeIndex)
    } else {
      onSkillSelect(selectedNodeIndex, skill.skill_id)
    }
  }

  if (!mounted) return null
  
  if (selectedNodeIndex === null) return null // Hide panel if no node is selected

  return (
    <div className="absolute bottom-6 left-6 z-10 w-80 max-h-[70vh] flex flex-col bg-white dark:bg-gray-900/95 rounded-xl overflow-hidden border border-gray-300 dark:border-gray-700 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-col gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800/60 bg-gray-100 dark:bg-gray-800/40 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-amber-500/10 border border-amber-500/20">
              <Zap className="w-3 h-3 text-amber-400" />
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider">Assign Skill</span>
          </div>

          {currentAssignment && (
            <button
              onClick={() => onSkillClear(selectedNodeIndex!)}
              className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-500 hover:text-red-400 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
              Clear
            </button>
          )}
        </div>

        {selectedStep && isExecutable ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-600 dark:text-gray-400 leading-snug">
            For <span className="text-gray-800 dark:text-gray-200 font-medium">{selectedStep.name}</span>
          </div>
        ) : !selectedStep ? (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600">
            <MousePointerClick className="w-3.5 h-3.5" />
            Click a node to assign a skill
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 dark:text-gray-600">
            Approval nodes don&apos;t use skills
          </div>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-gray-800/40 shrink-0 bg-white dark:bg-gray-900/50">
        {availableCategories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key as CategoryKey | 'all')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all duration-150',
              activeCategory === cat.key
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-400 dark:border-gray-600'
                : 'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <span>{cat.emoji}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Skill cards — scrollable area */}
      <div className="flex flex-col px-2 py-3 overflow-y-auto min-h-0">
        {displayedSkills.length === 0 ? (
          <div className="text-center text-[11px] text-gray-400 dark:text-gray-600 py-4">
            No skills available for this category
          </div>
        ) : (
          displayedSkills.map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isAssigned={currentAssignment === skill.id}
              isNodeSelected={selectedNodeIndex !== null && isExecutable}
              onClick={() => handleCardClick(skill)}
            />
          ))
        )}
      </div>
    </div>
  )
}
