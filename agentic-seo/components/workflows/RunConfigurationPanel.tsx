'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WorkflowTemplate, Client } from '@/lib/supabase/types'
import { useClient } from '@/components/layout/ClientProvider'
import { Play, Settings2, ShieldCheck, List, Globe, X } from 'lucide-react'
import KeywordsModal from './KeywordsModal'
import SiteListModal from './SiteListModal'

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
  const [targetSitesCount, setTargetSitesCount] = useState<number | string>(50)
  const [minDa, setMinDa] = useState<number | string>(30)
  const [minPa, setMinPa] = useState<number | string>(30)
  const [maxSpamScore, setMaxSpamScore] = useState<number | string>(4)

  const effectiveTargetSites = typeof targetSitesCount === 'number' ? targetSitesCount : (parseInt(targetSitesCount) || 0)
  const effectiveMinDa = typeof minDa === 'number' ? minDa : (parseInt(minDa) || 0)
  const effectiveMinPa = typeof minPa === 'number' ? minPa : (parseInt(minPa) || 0)
  const effectiveMaxSpamScore = typeof maxSpamScore === 'number' ? maxSpamScore : (parseInt(maxSpamScore) || 0)
  const [submissionType, setSubmissionType] = useState('bookmarking')
  const [clientTargetUrl, setClientTargetUrl] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [isNameEdited, setIsNameEdited] = useState(false)
  const [isKeywordsModalOpen, setIsKeywordsModalOpen] = useState(false)
  const [isSiteListModalOpen, setIsSiteListModalOpen] = useState(false)
  const [keywordCount, setKeywordCount] = useState(0)
  const [maxAvailableSites, setMaxAvailableSites] = useState(0)
  const [isPulsing, setIsPulsing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showSuccessNotification, setShowSuccessNotification] = useState(false)
  const [queuedRunsCount, setQueuedRunsCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  React.useEffect(() => {
    if (showSuccessNotification) {
      const timer = setTimeout(() => setShowSuccessNotification(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [showSuccessNotification])

  React.useEffect(() => {
    if (!isNameEdited && activeClient && template) {
      setCampaignName(`${template.name} for ${activeClient.name} (${submissionType})`)
    }
  }, [activeClient, template, submissionType, isNameEdited])

  // Fetch max available sites when filters change
  React.useEffect(() => {
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
          if (effectiveTargetSites > (count || 0)) {
            setTargetSitesCount(count || 0)
            // Trigger pulse effect
            setIsPulsing(true)
            setTimeout(() => setIsPulsing(false), 2000)
          }
        }
      } catch (err) {
        console.error('Failed to fetch max sites count:', err)
      }
    }
    fetchMaxSites()
  }, [submissionType, minDa, minPa, maxSpamScore])

  React.useEffect(() => {
    if (activeClient) {
      const fetchKeywords = async () => {
        try {
          const res = await fetch(`/api/keywords?client_id=${activeClient.id}`)
          if (res.ok) {
            const data = await res.json()
            setKeywordCount(data.length)
          }
        } catch (e) {
          console.error(e)
        }
      }
      fetchKeywords()
    }
  }, [activeClient, isKeywordsModalOpen])

  const handleStartCampaignClick = () => {
    if (!activeClient) {
      setErrorMessage('Please select a client from the sidebar first.')
      return
    }

    if (!clientTargetUrl.trim()) {
      setErrorMessage('Please provide the Client Target URL.')
      return
    }

    if (!campaignName.trim()) {
      setErrorMessage('Please provide a Campaign Name.')
      return
    }

    if (keywordCount === 0) {
      setErrorMessage('Please add at least one keyword for this client.')
      return
    }

    if (Math.min(effectiveTargetSites, maxAvailableSites) === 0) {
      setErrorMessage('No target sites available. Please adjust your filters or add target sites.')
      return
    }

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
        targetSitesCount: effectiveTargetSites,
        clientTargetUrl: clientTargetUrl.trim(),
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
    } catch (err: any) {
      console.error(err)
      setErrorMessage('Failed to start execution: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-[340px] flex-shrink-0 bg-white dark:bg-gray-900/50 overflow-y-auto flex flex-col h-full shadow-2xl relative z-20">

      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Settings2 className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Run Configuration</h2>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400">
          Configure parameters for the{' '}
          <span className="text-gray-700 dark:text-gray-300 font-medium">{template.name}</span> workflow.
        </p>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6">

        {/* Campaign Parameters */}
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            Campaign Parameters
          </h3>

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

          <div className="space-y-2">
            <label className="text-xs text-gray-400 dark:text-gray-600 flex items-center justify-between">
              <span>Client Target URL <span className="text-rose-500">*</span></span>
            </label>
            <div className="flex rounded-lg shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">
                https://
              </span>
              <input
                type="text"
                placeholder="client-site.com/page"
                value={clientTargetUrl}
                onChange={e => {
                  let val = e.target.value;
                  val = val.replace(/^https?:\/\//i, '');
                  setClientTargetUrl(val);
                }}
                className="flex-1 min-w-0 block w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-none rounded-r-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1">
                <span>Target Sites</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded ml-1 font-medium">
                  {maxAvailableSites} match filter
                </span>
              </label>
              <span className="text-xs text-gray-500">Number</span>
            </div>
            
            <input
              type="number"
              value={targetSitesCount}
              max={maxAvailableSites}
              min={0}
              onChange={e => {
                if (e.target.value === '') {
                  setTargetSitesCount('');
                  return;
                }
                let val = parseInt(e.target.value);
                if (isNaN(val)) val = 0;
                if (maxAvailableSites > 0 && val > maxAvailableSites) {
                  val = maxAvailableSites;
                  setIsPulsing(true);
                  setTimeout(() => setIsPulsing(false), 2000);
                } else if (maxAvailableSites === 0 && val > 0) {
                  val = 0;
                  setIsPulsing(true);
                  setTimeout(() => setIsPulsing(false), 2000);
                }
                setTargetSitesCount(val);
              }}
              className={`w-full bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none transition-all duration-500 ${isPulsing ? 'border border-rose-500 ring-2 ring-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.4)]' : 'border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-indigo-500/50'}`}
            />

            <div className="flex items-center gap-2">
              <button onClick={() => setIsSiteListModalOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors whitespace-nowrap">
                <Globe className="w-3.5 h-3.5" />
                Site List
              </button>
              <button onClick={() => setIsKeywordsModalOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors whitespace-nowrap">
                <List className="w-3.5 h-3.5" />
                Keywords
              </button>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              {effectiveTargetSites > maxAvailableSites && maxAvailableSites > 0 && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/50 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                  Only {maxAvailableSites} sites match your DA requirement. We will use {maxAvailableSites}.
                </div>
              )}
              {effectiveTargetSites > 0 && maxAvailableSites === 0 && (
                <div className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded border border-rose-200 dark:border-rose-800/50 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-rose-500"></span>
                  0 sites match your DA requirement. No backlinks will be created.
                </div>
              )}
              <div className="text-xs text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-2 rounded-lg text-center">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {Math.min(effectiveTargetSites, maxAvailableSites)}
                </span> target sites &times; <span className="font-medium text-gray-700 dark:text-gray-300">{keywordCount}</span> keywords = <span className="font-bold text-indigo-600 dark:text-indigo-400">{Math.min(effectiveTargetSites, maxAvailableSites) * keywordCount}</span> total target backlinks
              </div>
            </div>
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


        </div>
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
        <button
          onClick={handleStartCampaignClick}
          disabled={
            isSubmitting || 
            !activeClient || 
            !clientTargetUrl.trim() || 
            maxAvailableSites === 0 || 
            effectiveTargetSites <= 0 ||
            keywordCount === 0
          }
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98]"
        >
          <Play className="w-4 h-4" />
          {isSubmitting ? 'Starting...' : 'Start Campaign'}
        </button>
      </div>

      <KeywordsModal 
        isOpen={isKeywordsModalOpen} 
        onClose={() => setIsKeywordsModalOpen(false)} 
        clientId={activeClient?.id || ''} 
      />
      <SiteListModal
        isOpen={isSiteListModalOpen}
        onClose={() => setIsSiteListModalOpen(false)}
        category={submissionType}
      />

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
                  <li className="flex justify-between"><span className="font-medium">Target URL:</span> <span className="text-right truncate ml-4" title={clientTargetUrl}>{clientTargetUrl || 'None'}</span></li>
                  <li className="flex justify-between"><span className="font-medium">Target Sites:</span> <span>{Math.min(effectiveTargetSites, maxAvailableSites)}</span></li>
                  <li className="flex justify-between"><span className="font-medium">Keywords:</span> <span>{keywordCount}</span></li>
                  <li className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-white"><span className="font-medium text-gray-900 dark:text-white">Total Backlinks:</span> <span>{Math.min(effectiveTargetSites, maxAvailableSites) * keywordCount}</span></li>
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
    </div>
  )
}

