'use client'

import React, { useState, useEffect } from 'react'
import { Link2, Search, ArrowRight, FileText, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'

interface KeywordOpportunity {
  keyword: string;
  volume: string;
  difficulty: number;
  cpc: string;
  trend: string;
  potential: string;
}



const TrendSparkline = ({ trend }: { trend: string }) => {
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-indigo-500" />
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-rose-500" />
  return <Minus className="w-4 h-4 text-gray-400" />
}

const PotentialBadge = ({ level }: { level: string }) => {
  if (level === 'High') return <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">High</span>
  if (level === 'Medium') return <span className="text-amber-600 dark:text-amber-400 font-medium text-xs bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-md">Medium</span>
  return <span className="text-gray-500 font-medium text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">Low</span>
}

export default function BacklinkDashboard() {
  const [seedKeywords, setSeedKeywords] = useState('seo tools, backlink checker, link building')
  const [isSearching, setIsSearching] = useState(false)
  const [keywords, setKeywords] = useState<KeywordOpportunity[]>([])
  const [summary, setSummary] = useState({ total: 0, avgDifficulty: 0, avgVolume: 0 })
  const [error, setError] = useState('')

  // Initial load
  useEffect(() => {
    handleSearch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = async () => {
    if (!seedKeywords.trim()) return
    setIsSearching(true)
    setError('')
    try {
      const res = await fetch('/api/keywords/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: seedKeywords })
      })
      const data = await res.json()
      if (data.success) {
        setKeywords(data.data.keywords)
        setSummary(data.data.summary)
      } else {
        setError(data.error || 'Failed to fetch keywords')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setIsSearching(false)
    }
  }

  // Format avg volume for display
  const formatVolume = (vol: number) => {
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K'
    return vol.toString()
  }

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-gray-950 p-6 md:p-8">
      
      {/* Main Content Area */}
      <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1 shrink-0"><span className="text-indigo-600 mr-1">1.</span> Keyword Research & Analysis</h2>
        <p className="text-sm text-gray-500 mb-6 shrink-0">Find and analyze the best keywords for your backlink campaign</p>

        {/* Search Bar */}
        <div className="flex gap-3 mb-8 shrink-0">
          <div className="flex-1">
            <input 
              type="text" 
              value={seedKeywords}
              onChange={e => setSeedKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm"
              placeholder="Enter seed keywords (comma separated) e.g. seo tools, backlink checker"
            />
          </div>
          <div className="flex items-center">
            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="h-[46px] px-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center justify-center min-w-[140px] gap-2"
            >
              {isSearching ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</> : 'Find Keywords'}
            </button>
          </div>
        </div>
        
        {error && <div className="text-rose-500 text-sm mb-4 px-2 shrink-0">{error}</div>}

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8 shrink-0">
          <div className="bg-gray-50/80 dark:bg-gray-950/50 border border-gray-100 dark:border-gray-800/80 rounded-2xl p-5">
            <p className="text-[13px] text-gray-500 font-medium mb-1.5">Total Keywords</p>
            <p className="text-3xl font-bold text-indigo-600">{summary.total > 0 ? summary.total.toLocaleString() : '-'}</p>
          </div>
          <div className="bg-gray-50/80 dark:bg-gray-950/50 border border-gray-100 dark:border-gray-800/80 rounded-2xl p-5 relative">
            <p className="text-[13px] text-gray-500 font-medium mb-1.5">Avg. Difficulty</p>
            <p className="text-3xl font-bold text-emerald-500">{summary.avgDifficulty > 0 ? summary.avgDifficulty : '-'}</p>
            {summary.avgDifficulty > 0 && <span className="absolute bottom-5 right-5 text-[11px] font-bold text-emerald-600">Easy</span>}
          </div>
          <div className="bg-gray-50/80 dark:bg-gray-950/50 border border-gray-100 dark:border-gray-800/80 rounded-2xl p-5 relative">
            <p className="text-[13px] text-gray-500 font-medium mb-1.5">Avg. Volume</p>
            <p className="text-3xl font-bold text-indigo-600">{summary.avgVolume > 0 ? formatVolume(summary.avgVolume) : '-'}</p>
            {summary.avgVolume > 0 && <span className="absolute bottom-5 right-5 text-[11px] font-medium text-gray-400">Monthly</span>}
          </div>
        </div>

        {/* Full Width Table */}
        <div className="w-full flex-1 flex flex-col min-h-0">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 shrink-0">Top Keyword Opportunities</h3>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm flex-1 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 text-[11px] font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-5 py-3.5">Keyword</th>
                  <th className="px-5 py-3.5 text-right">Volume</th>
                  <th className="px-5 py-3.5 text-center">Difficulty</th>
                  <th className="px-5 py-3.5 text-right">CPC</th>
                  <th className="px-5 py-3.5 text-center">Trend</th>
                  <th className="px-5 py-3.5 text-center">Potential</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                {keywords.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                    <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{item.keyword}</td>
                    <td className="px-5 py-3.5 text-right text-gray-600 dark:text-gray-400 font-medium">{item.volume}</td>
                    <td className="px-5 py-3.5 text-center text-emerald-600 dark:text-emerald-400 font-bold">{item.difficulty}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 dark:text-gray-400">{item.cpc}</td>
                    <td className="px-5 py-3.5 flex justify-center"><TrendSparkline trend={item.trend} /></td>
                    <td className="px-5 py-3.5 text-center"><PotentialBadge level={item.potential} /></td>
                  </tr>
                ))}
                {keywords.length === 0 && !isSearching && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">No keywords found. Try searching.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
