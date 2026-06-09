'use client'

import { useState, useEffect } from 'react'
import { Zap, Search, Server, User, RefreshCw } from 'lucide-react'
import { SKILL_CATEGORY_COLORS, HermesSkill } from '@/lib/workflows/skills'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Skill } from '@/lib/supabase/types'

const CATEGORIES = [
  { key: 'all', label: 'All Skills', emoji: '⚡' },
  { key: 'research', label: 'Research', emoji: '🔍' },
  { key: 'analysis', label: 'Analysis', emoji: '📊' },
  { key: 'submission', label: 'Submission', emoji: '🌐' },
  { key: 'verification', label: 'Verification', emoji: '✅' },
  { key: 'reporting', label: 'Reporting', emoji: '📋' },
]

export default function SkillsPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchSkills = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('skills').select('*').order('name')
      if (error) throw error
      setSkills(data || [])
    } catch (err) {
      console.error('Failed to fetch skills', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSkills()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/skills/sync', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      await fetchSkills()
    } catch (err) {
      console.error('Error syncing skills:', err)
      alert('Failed to sync skills from Hermes.')
    } finally {
      setSyncing(false)
    }
  }

  const filteredSkills = skills.filter((skill) => {
    const matchesCategory = activeCategory === 'all' || skill.category === activeCategory
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (skill.description && skill.description.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesCategory && matchesSearch
  })

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Header */}
      <header className="px-8 py-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agentic Skills</h1>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400 max-w-2xl">
          Browse the available skills that your AI agents can perform during workflow executions.
          Skills are represented as slash commands and categorised by their function.
        </p>
      </header>

      {/* Controls */}
      <div className="px-8 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-6 flex-shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 flex-shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap',
                activeCategory === cat.key
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-400 dark:border-gray-600'
                  : 'bg-gray-50 dark:bg-gray-950 text-gray-400 dark:text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
              )}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing...' : 'Sync Hermes Skills'}
          </button>
        </div>
      </div>

      {/* Skills Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-500">
            <Zap className="w-12 h-12 mb-4 opacity-20 animate-pulse" />
            <p className="text-lg font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400">Loading skills...</p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-500">
            <Zap className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400">No skills found</p>
            <p className="text-sm">Try adjusting your search or category filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filteredSkills.map((skill) => {
              const categoryBadgeClass = SKILL_CATEGORY_COLORS[skill.category as keyof typeof SKILL_CATEGORY_COLORS] || 'text-gray-400 dark:text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
              
              return (
                <div
                  key={skill.id}
                  className="relative flex flex-col bg-white dark:bg-gray-900/40 backdrop-blur-sm border border-gray-200 dark:border-gray-800/60 rounded-xl p-5 hover:bg-gray-100 dark:hover:bg-gray-800/40 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 group h-full overflow-hidden"
                >
                  {/* Premium gradient top border on hover */}
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border', categoryBadgeClass)}>
                        {skill.category}
                      </span>
                      {skill.is_inbuilt ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-md" title="Built-in Skill">
                          <Server className="w-3 h-3" /> Inbuilt
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-md" title="Custom User Skill">
                          <User className="w-3 h-3" /> Custom
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {skill.compatible_types?.map((type: string) => (
                        <div key={type} className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-400 dark:bg-gray-500 transition-colors" title={type} />
                      ))}
                    </div>
                  </div>
                  
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 leading-tight group-hover:text-gray-900 dark:text-white transition-colors">
                    {skill.name}
                  </h3>
                  
                  <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400 leading-relaxed mb-5 flex-1 group-hover:text-gray-700 dark:text-gray-300 transition-colors">
                    {skill.description}
                  </p>
                  
                  <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-800/50">
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-500 group-hover:text-indigo-400 transition-colors">
                      <Zap className="w-4 h-4 flex-shrink-0" />
                      <code className="text-xs font-mono text-gray-400 dark:text-gray-600 dark:text-gray-400 group-hover:text-indigo-300 bg-gray-50 dark:bg-gray-950/50 group-hover:bg-indigo-500/10 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-800/80 group-hover:border-indigo-500/30 transition-all">
                        /{skill.skill_id}
                      </code>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
