'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WorkflowTemplate, Client } from '@/lib/supabase/types'
import { useClient } from '@/components/layout/ClientProvider'
import { Play, Settings2, ShieldCheck, Globe, X, Plus, Trash2, Save, ChevronDown, User, AlertTriangle } from 'lucide-react'
import SiteListModal from './SiteListModal'
import { cn } from '@/lib/utils'

interface TargetKeyword {
  keyword: string;
  description: string;
  tags: string;
}

interface TargetConfig {
  id: string;
  clientTargetUrl: string;
  targetSitesCount: number | string;
  keywords: TargetKeyword[];
}

export default function RunConfigurationPanel({
  template,
  clients,
}: {
  template: WorkflowTemplate
  clients: Client[]
}) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const { activeClient } = useClient()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [minDa, setMinDa] = useState<number | string>(30)
  const [minPa, setMinPa] = useState<number | string>(30)
  const [maxSpamScore, setMaxSpamScore] = useState<number | string>(4)

  const effectiveMinDa = typeof minDa === 'number' ? minDa : (parseInt(minDa) || 0)
  const effectiveMinPa = typeof minPa === 'number' ? minPa : (parseInt(minPa) || 0)
  const effectiveMaxSpamScore = typeof maxSpamScore === 'number' ? maxSpamScore : (parseInt(maxSpamScore) || 0)
  
  const [submissionType, setSubmissionType] = useState('bookmarking')
  const [campaignName, setCampaignName] = useState('')
  const [isNameEdited, setIsNameEdited] = useState(false)
  const [isSiteListModalOpen, setIsSiteListModalOpen] = useState(false)
  const [maxAvailableSites, setMaxAvailableSites] = useState(0)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showSuccessNotification, setShowSuccessNotification] = useState(false)
  const [queuedRunsCount, setQueuedRunsCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const [targets, setTargets] = useState<TargetConfig[]>([
    { id: Date.now().toString(), clientTargetUrl: '', targetSitesCount: 50, keywords: [] }
  ])

  // Saved Campaigns Feature
  const [savedCampaigns, setSavedCampaigns] = useState<any[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null)
  const [templateSearchQuery, setTemplateSearchQuery] = useState('')
  const [targetToDelete, setTargetToDelete] = useState<number | null>(null)

  // Draft feature
  const [hasDraft, setHasDraft] = useState(false)
  const draftKey = `draft_workflow_${template?.id}_${activeClient?.id}`

  const [quota, setQuota] = useState<{ limit: number | null, used: number, remaining: number | null } | null>(null)

  useEffect(() => {
    let intervalId: NodeJS.Timeout
    const fetchQuota = async () => {
      if (!activeClient) return
      try {
        const res = await fetch(`/api/clients/${activeClient.id}/quota`, { cache: 'no-store' })
        if (res.ok) setQuota(await res.json())
      } catch (err) {
        console.error('Failed to fetch quota', err)
      }
    }
    fetchQuota()
    intervalId = setInterval(fetchQuota, 15000)
    return () => clearInterval(intervalId)
  }, [activeClient])

  useEffect(() => {
    if (showSuccessNotification) {
      const timer = setTimeout(() => setShowSuccessNotification(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [showSuccessNotification])

  // Fetch saved campaigns
  useEffect(() => {
    if (activeClient && template) {
      fetch(`/api/campaigns/saved?client_id=${activeClient.id}&template_id=${template.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSavedCampaigns(data.data)
          }
        })
        .catch(console.error)
    }
  }, [activeClient, template])

  // Load draft on mount
  const sanitizeTargets = (rawTargets: any[]) => {
    if (!Array.isArray(rawTargets)) return []
    return rawTargets.map((t, i) => ({
      ...t,
      id: t.id || (Date.now() + i).toString(),
      keywords: Array.isArray(t.keywords) 
        ? t.keywords.map((kw: any) => {
            if (typeof kw === 'string') {
              return { keyword: kw, description: '', tags: '' }
            }
            return {
              keyword: kw?.keyword || '',
              description: kw?.description || '',
              tags: kw?.tags || ''
            }
          })
        : []
    }))
  }

  useEffect(() => {
    if (activeClient && template) {
      const draftStr = localStorage.getItem(draftKey)
      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr)
          setCampaignName(draft.campaignName || '')
          setMinDa(draft.minDa ?? 30)
          setMinPa(draft.minPa ?? 30)
          setMaxSpamScore(draft.maxSpamScore ?? 4)
          if (draft.targets && draft.targets.length > 0) {
             setTargets(sanitizeTargets(draft.targets))
          }
          setIsNameEdited(true)
          setHasDraft(true)
        } catch(e) {}
      } else if (!isNameEdited) {
        setCampaignName(`${template.name} for ${activeClient.name} (${submissionType})`)
      }
    }
  }, [activeClient, template, draftKey])

  // Auto-save draft on change
  useEffect(() => {
    if (activeClient && template) {
      const draft = { campaignName, minDa, minPa, maxSpamScore, targets }
      localStorage.setItem(draftKey, JSON.stringify(draft))
      setHasDraft(true)
    }
  }, [campaignName, minDa, minPa, maxSpamScore, targets, activeClient, template, draftKey])

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Browser Warning if leaving with unsaved draft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDraft) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasDraft])

  const discardDraft = () => {
    localStorage.removeItem(draftKey)
    setHasDraft(false)
    setIsNameEdited(false)
    setCampaignName(`${template.name} for ${activeClient?.name} (${submissionType})`)
    setMinDa(30)
    setMinPa(30)
    setMaxSpamScore(4)
    setTargets([{ id: Date.now().toString(), clientTargetUrl: '', targetSitesCount: 50, keywords: [] }])
    setLoadedTemplateId(null)
  }

  const loadSavedTemplate = (id: string) => {
    setIsDropdownOpen(false)
    const sc = savedCampaigns.find(c => c.id === id)
    if (sc && sc.config) {
      setMinDa(sc.config.minDa ?? 30)
      setMinPa(sc.config.minPa ?? 30)
      setMaxSpamScore(sc.config.maxSpamScore ?? 4)
      if (sc.config.targets && sc.config.targets.length > 0) {
         setTargets(sanitizeTargets(sc.config.targets))
      }
      setCampaignName(sc.name)
      setIsNameEdited(true)
      setLoadedTemplateId(id)
      setSaveTemplateName(sc.name)
    }
  }

  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim()) {
       setErrorMessage('Template name is required')
       return
    }
    setIsSavingTemplate(true)
    try {
      const config = { minDa: effectiveMinDa, minPa: effectiveMinPa, maxSpamScore: effectiveMaxSpamScore, targets }
      const res = await fetch('/api/campaigns/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeClient?.id,
          templateId: template.id,
          name: saveTemplateName.trim(),
          config
        })
      })
      const data = await res.json()
      if (data.success) {
        setSavedCampaigns(prev => {
          const idx = prev.findIndex(c => c.id === data.data.id);
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = data.data;
            return copy;
          }
          return [data.data, ...prev];
        })
        setLoadedTemplateId(data.data.id)
        setShowSaveModal(false)
        setSaveTemplateName('')
      } else {
        setErrorMessage(data.error)
      }
    } catch(e:any) {
      setErrorMessage(e.message)
    } finally {
      setIsSavingTemplate(false)
    }
  }

  // Fetch max available sites when filters change
  useEffect(() => {
    const fetchMaxSites = async () => {
      try {
        const queryParams = new URLSearchParams({
          category: submissionType,
          minDa: effectiveMinDa.toString(),
          minPa: effectiveMinPa.toString(),
          maxSpamScore: effectiveMaxSpamScore.toString(),
          countOnly: 'true'
        })
        const res = await fetch(`/api/target_sites?${queryParams}`)
        if (res.ok) {
          const { count } = await res.json()
          setMaxAvailableSites(count || 0)
        }
      } catch (err) {
        console.error('Failed to fetch max sites count:', err)
      }
    }
    fetchMaxSites()
  }, [submissionType, minDa, minPa, maxSpamScore])

  const addEmptyKeywordToTarget = (index: number) => {
    const newTargets = [...targets];
    newTargets[index].keywords.push({ keyword: '', description: '', tags: '' });
    setTargets(newTargets);
  }

  const updateKeyword = (targetIndex: number, keywordIndex: number, field: keyof TargetKeyword, value: string) => {
    const newTargets = [...targets];
    newTargets[targetIndex].keywords[keywordIndex] = {
      ...newTargets[targetIndex].keywords[keywordIndex],
      [field]: value
    };
    setTargets(newTargets);
  }

  const updateTarget = (index: number, field: keyof TargetConfig, value: any) => {
    const newTargets = [...targets];
    newTargets[index] = { ...newTargets[index], [field]: value };
    setTargets(newTargets);
  }
  
  const removeTarget = (index: number) => {
    const newTargets = targets.filter((_, i) => i !== index);
    setTargets(newTargets);
  }

  const removeKeyword = (targetIndex: number, keywordIndex: number) => {
    const newTargets = [...targets];
    newTargets[targetIndex].keywords.splice(keywordIndex, 1);
    setTargets(newTargets);
  }

  const totalBacklinks = targets.reduce((sum, t) => {
    const effectiveCount = typeof t.targetSitesCount === 'number' ? t.targetSitesCount : (parseInt(t.targetSitesCount as string) || 0)
    const count = Math.min(effectiveCount, maxAvailableSites)
    const validKeywordsCount = t.keywords.filter(k => k.keyword.trim() !== '' && k.description.trim() !== '' && k.tags.trim() !== '').length;
    return sum + (count * validKeywordsCount)
  }, 0)

  const handleStartCampaignClick = () => {
    if (!activeClient) return setErrorMessage('Please select a client from the sidebar first.')
    if (!campaignName.trim()) return setErrorMessage('Please provide a Campaign Name.')
    if (targets.length === 0) return setErrorMessage('Please add at least one target configuration.')
    if (quota && quota.limit !== null && totalBacklinks > quota.remaining!) {
      return setErrorMessage(`Daily Quota Exceeded. You only have ${quota.remaining} backlinks remaining today.`)
    }

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.clientTargetUrl.trim()) return setErrorMessage(`Target ${i+1} is missing a Client Target URL.`);
      const validKws = t.keywords.filter(k => k.keyword.trim() !== '' && k.description.trim() !== '' && k.tags.trim() !== '');
      if (validKws.length === 0) return setErrorMessage(`Target ${i+1} must have at least one completely filled keyword row (Keyword, Description, and Tags).`);
      if (t.keywords.length > validKws.length) return setErrorMessage(`Target ${i+1} has incomplete keyword rows. Please fill in all fields or remove empty rows.`);
    }

    if (maxAvailableSites === 0) return setErrorMessage('No target sites available. Please adjust your DA/PA filters.')

    setShowConfirmModal(true)
  }

  const executeCampaign = async () => {
    setShowConfirmModal(false)
    setIsSubmitting(true)

    try {
      const payload = {
        clientId: activeClient?.id,
        clientName: activeClient?.name,
        templateId: template.id,
        templateName: template.name,
        departmentId: (template as any).department_id ?? null,
        submissionType,
        minDa: effectiveMinDa,
        minPa: effectiveMinPa,
        maxSpamScore: effectiveMaxSpamScore,
        targets: targets.map(t => ({
           clientTargetUrl: t.clientTargetUrl.trim(),
           targetSitesCount: typeof t.targetSitesCount === 'number' ? t.targetSitesCount : (parseInt(t.targetSitesCount as string) || 0),
           keywords: t.keywords.filter(k => k.keyword.trim() !== '' && k.description.trim() !== '' && k.tags.trim() !== '')
        })),
        campaignName: campaignName.trim()
      }

      const res = await fetch('/api/campaigns/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start campaign')
      }

      setQueuedRunsCount(data.queuedRunsCount)
      setShowSuccessNotification(true)
      // Discard draft on successful launch to avoid stale configs
      localStorage.removeItem(draftKey)
      setHasDraft(false)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start execution')
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasInvalidTargets = targets.some(t => {
    if (!t.clientTargetUrl.trim()) return true;
    const validKws = t.keywords.filter(k => k.keyword.trim() !== '' && k.description.trim() !== '' && k.tags.trim() !== '');
    if (validKws.length === 0) return true;
    if (t.keywords.length > validKws.length) return true;
    return false;
  });

  return (
    <div className="w-[500px] flex-shrink-0 bg-white dark:bg-gray-900/50 overflow-y-auto flex flex-col h-full shadow-2xl relative z-20">

      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 relative flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Settings2 className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Run Configuration</h2>
        </div>
        
        <div className="relative w-full" ref={dropdownRef}>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            Saved Templates <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                    <input 
                      type="text" 
                      placeholder="Search templates..."
                      value={templateSearchQuery}
                      onChange={e => setTemplateSearchQuery(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    <button 
                      onClick={() => { discardDraft(); setIsDropdownOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" /> Create New Template
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-gray-800 my-1"></div>
                    {savedCampaigns.filter(sc => sc.name.toLowerCase().includes(templateSearchQuery.toLowerCase())).length === 0 ? (
                      <div className="p-3 text-center text-xs text-gray-500">No templates found.</div>
                    ) : (
                      savedCampaigns.filter(sc => sc.name.toLowerCase().includes(templateSearchQuery.toLowerCase())).map(sc => (
                        <button 
                          key={sc.id} 
                          onClick={() => loadSavedTemplate(sc.id)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors group"
                        >
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{sc.name}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <User className="w-3 h-3 text-gray-400" />
                            <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 rounded">{sc.profiles?.full_name || 'Unknown User'}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6">

        {/* Global Settings */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-400 dark:text-gray-600 flex items-center justify-between">
              <span>Campaign Name <span className="text-rose-500">*</span></span>
            </label>
            <input
              type="text"
              placeholder="Campaign Name"
              value={campaignName}
              onChange={e => {
                setCampaignName(e.target.value);
                setIsNameEdited(true);
              }}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-gray-400 dark:text-gray-600 flex items-center justify-between">
                <span>Min DA</span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={minDa}
                onChange={e => {
                  if (e.target.value === '') { setMinDa(''); return; }
                  setMinDa(parseInt(e.target.value) || 0);
                }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-400 dark:text-gray-600 flex items-center justify-between">
                <span>Min PA</span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={minPa}
                onChange={e => {
                  if (e.target.value === '') { setMinPa(''); return; }
                  setMinPa(parseInt(e.target.value) || 0);
                }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-400 dark:text-gray-600 flex items-center justify-between">
                <span>Max SS</span>
              </label>
              <input
                type="number"
                min={0}
                max={4}
                value={maxSpamScore}
                onChange={e => {
                  if (e.target.value === '') { setMaxSpamScore(''); return; }
                  let val = parseInt(e.target.value) || 0;
                  if (val > 4) val = 4;
                  setMaxSpamScore(val);
                }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>
          
          <button onClick={() => setIsSiteListModalOpen(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
            <Globe className="w-4 h-4" />
            View Available Sites ({maxAvailableSites})
          </button>
        </div>

        {/* Target Configurations */}
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Target URLs & Keywords
            </h3>
          </div>

          <div className="space-y-4">
            {targets.map((target, index) => {
               const effectiveTargetSites = typeof target.targetSitesCount === 'number' ? target.targetSitesCount : (parseInt(target.targetSitesCount as string) || 0);
               const actualSites = Math.min(effectiveTargetSites, maxAvailableSites);
               const validKeywordsCount = target.keywords.filter(k => k.keyword.trim() !== '' && k.description.trim() !== '' && k.tags.trim() !== '').length;
               
               return (
                 <div key={target.id} className="p-4 bg-gray-50 dark:bg-gray-950/50 border border-gray-200 dark:border-gray-800 rounded-xl space-y-3 relative group">
                   {targets.length > 1 && (
                     <button onClick={() => setTargetToDelete(index)} className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   )}
                   
                   <div className="space-y-1.5">
                     <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Target URL <span className="text-rose-500">*</span></label>
                     <div className="flex rounded-lg shadow-sm">
                        <span className="inline-flex items-center px-2.5 rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs">
                          https://
                        </span>
                        <input
                          type="text"
                          required
                          placeholder="site.com/page *"
                          value={target.clientTargetUrl}
                          onChange={e => {
                            let val = e.target.value.replace(/^https?:\/\//i, '');
                            updateTarget(index, 'clientTargetUrl', val);
                          }}
                          className="flex-1 min-w-0 block w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none rounded-r-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <div className="flex justify-between items-center">
                       <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Keywords <span className="text-rose-500">*</span></label>
                       <span className="text-[10px] text-gray-400">{validKeywordsCount} added</span>
                     </div>
                     <div className="flex flex-col gap-2 mb-2">
                       {target.keywords.map((kwObj, kwIdx) => (
                         <div key={kwIdx} className="flex items-start gap-2 bg-gray-100 dark:bg-gray-800/50 p-2 rounded-lg">
                           <textarea 
                             required
                             rows={2}
                             placeholder="Keyword *"
                             value={kwObj.keyword || ''}
                             onChange={e => updateKeyword(index, kwIdx, 'keyword', e.target.value)}
                             className="flex-1 block w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none resize-y min-h-[42px]"
                           />
                           <textarea 
                             required
                             rows={2}
                             placeholder="Description *"
                             value={kwObj.description || ''}
                             onChange={e => updateKeyword(index, kwIdx, 'description', e.target.value)}
                             className="flex-1 block w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none resize-y min-h-[42px]"
                           />
                           <textarea 
                             required
                             rows={2}
                             placeholder="Tags *"
                             value={kwObj.tags || ''}
                             onChange={e => updateKeyword(index, kwIdx, 'tags', e.target.value)}
                             className="flex-1 block w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none resize-y min-h-[42px]"
                           />
                           <button onClick={() => removeKeyword(index, kwIdx)} className="p-1.5 mt-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </div>
                       ))}
                     </div>
                     <div className="flex">
                       <button onClick={() => addEmptyKeywordToTarget(index)} className="w-full px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs font-medium flex items-center justify-center gap-1">
                         <Plus className="w-3 h-3" /> Add Keyword
                       </button>
                     </div>
                   </div>

                   <div className="space-y-1.5 pt-1">
                     <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Bookmarking Sites (Limit)</label>
                     <input
                       type="number"
                       value={target.targetSitesCount}
                       min={0}
                       onChange={e => {
                         if (e.target.value === '') { updateTarget(index, 'targetSitesCount', ''); return; }
                         let val = parseInt(e.target.value) || 0;
                         updateTarget(index, 'targetSitesCount', val);
                       }}
                       className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                     />
                   </div>

                   <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-2 rounded-lg text-center shadow-sm">
                     <span className="font-medium text-gray-700 dark:text-gray-300">{actualSites}</span> sites &times; <span className="font-medium text-gray-700 dark:text-gray-300">{validKeywordsCount}</span> keywords = <span className="font-bold text-indigo-600 dark:text-indigo-400">{actualSites * validKeywordsCount}</span> target backlinks
                   </div>
                 </div>
               )
            })}
          </div>

          <button 
            onClick={() => setTargets([...targets, { id: Date.now().toString(), clientTargetUrl: '', targetSitesCount: 50, keywords: [] }])}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-sm font-medium mt-4"
          >
            <Plus className="w-4 h-4" /> Add Another Target
          </button>

        </div>
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 mt-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Backlinks</span>
          <div className="flex items-center gap-2">
            {quota && quota.limit !== null && (
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full transition-colors", totalBacklinks > quota.remaining! ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 animate-pulse" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400")}>
                {quota.remaining} remaining
              </span>
            )}
            <span className={cn("text-lg font-bold transition-colors", quota && quota.limit !== null && totalBacklinks > quota.remaining! ? "text-red-500" : "text-indigo-600 dark:text-indigo-400")}>
              {totalBacklinks}
            </span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => { 
              if (!saveTemplateName) setSaveTemplateName(campaignName); 
              setShowSaveModal(true); 
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl transition-all shadow-sm active:scale-[0.98]"
          >
            <Save className="w-4 h-4" /> {loadedTemplateId ? 'Update' : 'Save'}
          </button>
          
          <button
            onClick={handleStartCampaignClick}
            disabled={
              isSubmitting ||
              !activeClient ||
              !campaignName.trim() ||
              targets.length === 0 ||
              hasInvalidTargets ||
              maxAvailableSites === 0 ||
              totalBacklinks === 0 ||
              (quota !== null && quota.limit !== null && totalBacklinks > quota.remaining!)
            }
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98]"
          >
            <Play className="w-4 h-4" />
            {isSubmitting ? 'Starting...' : (quota !== null && quota.limit !== null && totalBacklinks > quota.remaining!) ? 'Quota Exceeded' : 'Start'}
          </button>
        </div>
      </div>

      <SiteListModal
        isOpen={isSiteListModalOpen}
        onClose={() => setIsSiteListModalOpen(false)}
        category={submissionType}
      />

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {loadedTemplateId ? 'Update Campaign Template' : 'Save Campaign Template'}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {loadedTemplateId ? 'Save changes to the current template, or change the name to save as a new template.' : 'Save these settings to easily re-run this exact campaign later.'}
              </p>
              
              <div className="space-y-2 mb-6">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Template Name</label>
                <input 
                  type="text"
                  value={saveTemplateName}
                  onChange={e => setSaveTemplateName(e.target.value)}
                  placeholder="e.g. Monthly Standard Bookmarking"
                  className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={handleSaveTemplate} disabled={isSavingTemplate} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all shadow-md shadow-indigo-900/20 flex items-center gap-2">
                  {isSavingTemplate ? 'Saving...' : (loadedTemplateId && saveTemplateName.trim() === savedCampaigns.find(c => c.id === loadedTemplateId)?.name ? 'Update Original' : 'Save as New')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirm Campaign Launch</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You are about to launch the <span className="font-semibold text-gray-900 dark:text-white">{template.name}</span> campaign for <span className="font-semibold text-gray-900 dark:text-white">{activeClient?.name}</span>.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-800">
                <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-400">
                  <li className="flex justify-between"><span className="font-medium">Targets:</span> <span>{targets.length}</span></li>
                  <li className="flex justify-between"><span className="font-medium">Max Sites / Target:</span> <span>Up to {Math.max(...targets.map(t => typeof t.targetSitesCount === 'number' ? t.targetSitesCount : parseInt(t.targetSitesCount as string) || 0))}</span></li>
                  <li className="flex justify-between"><span className="font-medium">Total Keywords:</span> <span>{targets.reduce((sum, t) => sum + t.keywords.length, 0)}</span></li>
                  <li className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-white"><span className="font-medium text-gray-900 dark:text-white">Total Backlinks:</span> <span className="text-indigo-600 dark:text-indigo-400">{totalBacklinks}</span></li>
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowConfirmModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={executeCampaign} disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all shadow-md shadow-indigo-900/20 flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Confirm & Launch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification (Toast) */}
      {showSuccessNotification && (
        <div className="fixed bottom-6 right-6 z-[100] bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800/50 rounded-xl shadow-2xl p-4 flex items-start gap-3 w-80 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="w-8 h-8 flex-shrink-0 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center border border-green-200 dark:border-green-800/50 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Campaign Started!</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Successfully queued <span className="font-bold text-gray-900 dark:text-white">{queuedRunsCount}</span> workflow runs.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowSuccessNotification(false)
                  router.push('/dashboard/tasks')
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-indigo-900/20"
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

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col text-center animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-800/50">
                <X className="w-8 h-8 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Action Required</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {errorMessage}
              </p>
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

      {/* Target Delete Confirmation Modal */}
      {targetToDelete !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Remove Target Block</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to remove this target block and all its associated keywords? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setTargetToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={() => { removeTarget(targetToDelete); setTargetToDelete(null); }} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-lg transition-all shadow-md shadow-rose-900/20">
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
