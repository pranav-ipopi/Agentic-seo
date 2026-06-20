'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WorkflowTemplate, Client } from '@/lib/supabase/types'
import { useClient } from '@/components/layout/ClientProvider'
import {
  Play, Settings2, ShieldCheck, X, FileText, Globe, Plus, Trash2,
  ChevronDown, Loader2, List, RefreshCw
} from 'lucide-react'
import KeywordsModal from './KeywordsModal'

// ── Supported article platforms ────────────────────────────────────────────

const DEFAULT_PLATFORMS = [
  { id: 'blogger',      name: 'Blogger',        url: 'blogger.com',      icon: '📝', color: 'orange' },
  { id: 'tumblr',       name: 'Tumblr',          url: 'tumblr.com',       icon: '📖', color: 'indigo' },
  { id: 'slideshare',   name: 'SlideShare',      url: 'slideshare.net',   icon: '📊', color: 'blue' },
  { id: 'wordpress',    name: 'WordPress.com',   url: 'wordpress.com',    icon: '🌐', color: 'cyan' },
  { id: 'googleslides', name: 'Google Slides',   url: 'slides.google.com',icon: '🎯', color: 'green' },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function ArticleRunConfigurationPanel({
  template,
  clients,
}: {
  template: WorkflowTemplate
  clients: Client[]
}) {
  const router = useRouter()
  const { activeClient } = useClient()

  // ── State ──
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [campaignName, setCampaignName]         = useState('')
  const [isNameEdited, setIsNameEdited]         = useState(false)
  const [clientTargetUrl, setClientTargetUrl]   = useState('')
  const [articleTitle, setArticleTitle]         = useState('')
  const [articleDescription, setArticleDescription] = useState('')

  // Platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(DEFAULT_PLATFORMS.map(p => p.id))
  )
  const [customPlatforms, setCustomPlatforms]   = useState<Array<{ id: string; name: string; url: string; icon?: string; color?: string }>>([])
  const [showCustomInput, setShowCustomInput]   = useState(false)
  const [customPlatformInput, setCustomPlatformInput] = useState('')

  // BrowserUse profiles
  const [profiles, setProfiles]               = useState<Array<{ id: string; name: string }>>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [profilesError, setProfilesError]     = useState('')
  const [selectedProfileId, setSelectedProfileId] = useState('')

  // Keywords
  const [keywordCount, setKeywordCount]         = useState(0)
  const [isKeywordsModalOpen, setIsKeywordsModalOpen] = useState(false)

  // UI state
  const [showConfirmModal, setShowConfirmModal]   = useState(false)
  const [showSuccessNotification, setShowSuccessNotification] = useState(false)
  const [queuedRunsCount, setQueuedRunsCount]   = useState(0)
  const [errorMessage, setErrorMessage]         = useState('')

  // ── Effects ──

  // Auto-generate campaign name
  useEffect(() => {
    if (!isNameEdited && activeClient && template) {
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      setCampaignName(`Article Campaign — ${activeClient.name} (${date})`)
    }
  }, [activeClient, template, isNameEdited])

  // Auto-dismiss success toast
  useEffect(() => {
    if (showSuccessNotification) {
      const t = setTimeout(() => setShowSuccessNotification(false), 6000)
      return () => clearTimeout(t)
    }
  }, [showSuccessNotification])

  // Fetch BrowserUse profiles
  const fetchProfiles = async () => {
    setProfilesLoading(true)
    setProfilesError('')
    try {
      const res = await fetch('/api/browser-use/profiles')
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const { profiles: list } = await res.json()
      setProfiles(list || [])
      if (list?.length > 0 && !selectedProfileId) {
        setSelectedProfileId(list[0].id)
      }
    } catch (e: any) {
      setProfilesError(e.message)
    } finally {
      setProfilesLoading(false)
    }
  }

  useEffect(() => { fetchProfiles() }, [])

  // Fetch keyword count
  useEffect(() => {
    if (!activeClient) return
    const load = async () => {
      try {
        const res = await fetch(`/api/keywords?client_id=${activeClient.id}`)
        if (res.ok) {
          const data = await res.json()
          setKeywordCount(data.length)
        }
      } catch {}
    }
    load()
  }, [activeClient, isKeywordsModalOpen])

  // ── Platform helpers ──

  const allPlatforms = [
    ...DEFAULT_PLATFORMS,
    ...customPlatforms,
  ]

  const activePlatforms = allPlatforms.filter(p => selectedPlatforms.has(p.id))

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addCustomPlatform = () => {
    const raw = customPlatformInput.trim()
    if (!raw) return
    const url = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    const name = url.split('.')[0].charAt(0).toUpperCase() + url.split('.')[0].slice(1)
    const id = `custom_${Date.now()}`
    setCustomPlatforms(prev => [...prev, { id, name, url }])
    setSelectedPlatforms(prev => new Set([...prev, id]))
    setCustomPlatformInput('')
    setShowCustomInput(false)
  }

  // ── Submission ──

  const totalArticles = activePlatforms.length * keywordCount

  const handleStartClick = () => {
    if (!activeClient)            { setErrorMessage('Please select a client from the sidebar.'); return }
    if (!clientTargetUrl.trim())  { setErrorMessage('Please enter the Client Target URL.'); return }
    if (!articleTitle.trim())     { setErrorMessage('Please enter an Article Title.'); return }
    if (!selectedProfileId)       { setErrorMessage('Please select a BrowserUse profile.'); return }
    if (keywordCount === 0)       { setErrorMessage('Please add at least one keyword for this client.'); return }
    if (activePlatforms.length === 0) { setErrorMessage('Please select at least one platform.'); return }
    setShowConfirmModal(true)
  }

  const executeCampaign = async () => {
    setShowConfirmModal(false)
    setIsSubmitting(true)

    try {
      const payload = {
        clientId:           activeClient?.id,
        clientName:         activeClient?.name,
        templateId:         template.id,
        templateName:       template.name,
        departmentId:       (template as any).department_id ?? null,
        campaignName:       campaignName.trim(),
        clientTargetUrl:    clientTargetUrl.trim(),
        articleTitle:       articleTitle.trim(),
        articleDescription: articleDescription.trim(),
        platforms:          activePlatforms,
        profileId:          selectedProfileId,
        articlesPerDay:     5, // Default hardcoded
      }

      const res = await fetch('/api/campaigns/execute-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start campaign')

      setQueuedRunsCount(data.queuedRunsCount)
      setShowSuccessNotification(true)
    } catch (err: any) {
      setErrorMessage('Failed to start campaign: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Render ──

  return (
    <div className="w-[360px] flex-shrink-0 bg-white dark:bg-gray-900/50 overflow-y-auto flex flex-col h-full shadow-2xl relative z-20">

      {/* ── Header ── */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Article Configuration</h2>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Configure the{' '}
          <span className="text-gray-700 dark:text-gray-300 font-medium">{template.name}</span> workflow.
        </p>
      </div>

      {/* ── Body ── */}
      <div className="p-5 flex-1 flex flex-col gap-5">

        {/* ── Campaign Parameters ── */}
        <section className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Campaign Parameters
          </h3>

          {/* Campaign Name */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 dark:text-gray-500">
              Campaign Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={e => { setCampaignName(e.target.value); setIsNameEdited(true) }}
              placeholder="Article Campaign — Client Name"
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>

          {/* Client Target URL */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 dark:text-gray-500">
              Client Target URL <span className="text-rose-500">*</span>
            </label>
            <div className="flex rounded-lg shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs">
                https://
              </span>
              <input
                type="text"
                placeholder="your-client.com/page"
                value={clientTargetUrl}
                onChange={e => setClientTargetUrl(e.target.value.replace(/^https?:\/\//i, ''))}
                className="flex-1 min-w-0 block bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-none rounded-r-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
        </section>

        {/* ── Article Content ── */}
        <section className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Article Content
          </h3>

          {/* Article Title */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 dark:text-gray-500">
              Article Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 10 Best SEO Tools to Boost Rankings in 2024"
              value={articleTitle}
              onChange={e => setArticleTitle(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>

          {/* Article Description */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 dark:text-gray-500">
              Description / Instructions
              <span className="ml-1 text-[10px] text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded font-medium">
                LLM generates body from this
              </span>
            </label>
            <textarea
              rows={3}
              placeholder="Describe the article topic, target audience, tone, and any specific points to include..."
              value={articleDescription}
              onChange={e => setArticleDescription(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
            />
          </div>

          {/* Keywords button */}
          <button
            onClick={() => setIsKeywordsModalOpen(true)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors border border-violet-200 dark:border-violet-500/20"
          >
            <div className="flex items-center gap-1.5">
              <List className="w-3.5 h-3.5" />
              <span>Manage Keywords</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              keywordCount > 0
                ? 'bg-violet-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {keywordCount} {keywordCount === 1 ? 'keyword' : 'keywords'}
            </span>
          </button>
        </section>

        {/* ── Platform Selection ── */}
        <section className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Platforms
            </h3>
            <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded font-medium border border-violet-200 dark:border-violet-800/50">
              {activePlatforms.length} selected
            </span>
          </div>

          <div className="space-y-1.5">
            {allPlatforms.map(platform => (
              <label
                key={platform.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                  selectedPlatforms.has(platform.id)
                    ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700/50'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedPlatforms.has(platform.id)}
                  onChange={() => togglePlatform(platform.id)}
                  className="w-3.5 h-3.5 rounded accent-violet-600 flex-shrink-0"
                />
                <span className="text-base leading-none">{platform.icon || '🔗'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {platform.name}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{platform.url}</div>
                </div>
                {customPlatforms.some(c => c.id === platform.id) && (
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault()
                      setCustomPlatforms(prev => prev.filter(c => c.id !== platform.id))
                      setSelectedPlatforms(prev => { const n = new Set(prev); n.delete(platform.id); return n })
                    }}
                    className="text-gray-400 hover:text-rose-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </label>
            ))}

            {/* Add custom platform */}
            {showCustomInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. medium.com"
                  value={customPlatformInput}
                  onChange={e => setCustomPlatformInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomPlatform(); if (e.key === 'Escape') setShowCustomInput(false) }}
                  className="flex-1 bg-gray-50 dark:bg-gray-950 border border-violet-300 dark:border-violet-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <button
                  onClick={addCustomPlatform}
                  className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowCustomInput(false)}
                  className="px-2 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomInput(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-violet-400 dark:hover:border-violet-600 hover:text-violet-500 dark:hover:text-violet-400 rounded-lg text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Platform
              </button>
            )}
          </div>
        </section>

        {/* ── BrowserUse Profile ── */}
        <section className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              BrowserUse Profile
            </h3>
            <button
              onClick={fetchProfiles}
              disabled={profilesLoading}
              className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-400 transition-colors"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${profilesLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {profilesError ? (
            <div className="text-[11px] text-rose-500 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-lg p-2.5">
              ⚠️ {profilesError}
              <br />
              <span className="text-[10px] text-rose-400">Check that BROWSER_USE_API_KEY is set in .env.local</span>
            </div>
          ) : profilesLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading profiles...
            </div>
          ) : profiles.length === 0 ? (
            <div className="text-[11px] text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5">
              No profiles found. Create profiles at{' '}
              <a href="https://cloud.browser-use.com" target="_blank" rel="noopener" className="text-violet-500 underline">
                cloud.browser-use.com
              </a>
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedProfileId}
                onChange={e => setSelectedProfileId(e.target.value)}
                className="w-full appearance-none bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 pr-8 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              >
                <option value="">— Select a profile —</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          )}

          <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-relaxed">
            The browser profile contains saved logins for the selected platforms. Create and configure profiles at{' '}
            <a href="https://cloud.browser-use.com" target="_blank" rel="noopener" className="text-violet-400 hover:underline">
              cloud.browser-use.com
            </a>
          </p>
        </section>

        {/* ── Summary ── */}
        <section className="pt-4 border-t border-gray-200 dark:border-gray-800/50">
          {totalArticles > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-3 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span>Platforms × Keywords</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {activePlatforms.length} × {keywordCount} = <span className="text-violet-600 dark:text-violet-400">{totalArticles} articles</span>
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Footer ── */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
        <button
          onClick={handleStartClick}
          disabled={
            isSubmitting ||
            !activeClient ||
            !clientTargetUrl.trim() ||
            !articleTitle.trim() ||
            !selectedProfileId ||
            keywordCount === 0 ||
            activePlatforms.length === 0
          }
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-violet-900/20 active:scale-[0.98]"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isSubmitting ? 'Launching...' : 'Start Article Campaign'}
        </button>
      </div>

      {/* ── Keywords Modal ── */}
      <KeywordsModal
        isOpen={isKeywordsModalOpen}
        onClose={() => setIsKeywordsModalOpen(false)}
        clientId={activeClient?.id || ''}
      />

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirm Campaign Launch</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You are about to launch an article submission campaign for{' '}
                <span className="font-semibold text-gray-900 dark:text-white">{activeClient?.name}</span>.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-800 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span className="font-medium">Article Title:</span>
                  <span className="text-right truncate ml-4 max-w-[180px]" title={articleTitle}>{articleTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Platforms:</span>
                  <span>{activePlatforms.length} selected</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Keywords:</span>
                  <span>{keywordCount}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-white">
                  <span>Total Articles:</span>
                  <span className="text-violet-600 dark:text-violet-400">{totalArticles}</span>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeCampaign}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all shadow-md shadow-violet-900/20 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Confirm & Launch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Toast ── */}
      {showSuccessNotification && (
        <div className="fixed bottom-6 right-6 z-[100] bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800/50 rounded-xl shadow-2xl p-4 flex items-start gap-3 w-80 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="w-8 h-8 flex-shrink-0 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center border border-green-200 dark:border-green-800/50 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Campaign Started! 🚀</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Successfully queued <span className="font-bold text-gray-900 dark:text-white">{queuedRunsCount}</span> article submissions.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowSuccessNotification(false); router.push('/dashboard/tasks') }}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-violet-900/20"
              >
                View Tasks
              </button>
              <button
                onClick={() => setShowSuccessNotification(false)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setShowSuccessNotification(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 absolute top-3 right-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Error Modal ── */}
      {errorMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl text-center animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-800/50">
                <X className="w-8 h-8 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Action Required</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage('')}
                className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-bold rounded-lg transition-all"
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
