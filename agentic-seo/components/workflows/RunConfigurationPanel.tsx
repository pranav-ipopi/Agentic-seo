'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WorkflowTemplate, Client } from '@/lib/supabase/types'
import { useClient } from '@/components/layout/ClientProvider'
import { Play, Settings2, ShieldCheck, List } from 'lucide-react'
import KeywordsModal from './KeywordsModal'

export default function RunConfigurationPanel({
  template,
  clients,
  skillOverrides = {},
}: {
  template: WorkflowTemplate
  clients: Client[]
  skillOverrides?: Record<string, string>
}) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const { activeClient } = useClient()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [targetBacklinks, setTargetBacklinks] = useState(50)
  const [minDa, setMinDa] = useState(30)
  const [submissionType, setSubmissionType] = useState('bookmarking')
  const [clientTargetUrl, setClientTargetUrl] = useState('')
  const [isKeywordsModalOpen, setIsKeywordsModalOpen] = useState(false)

  const handleStartExecution = async () => {
    if (!activeClient) {
      alert('Please select a client from the sidebar first.')
      return
    }

    if (!clientTargetUrl.trim()) {
      alert('Please provide the Client Target URL.')
      return
    }

    setIsSubmitting(true)

    try {
      // 1. Fetch available target sites from inventory
      const { data: targetSites, error: sitesError } = await supabase
        .from('target_sites')
        .select('url, da')
        .eq('category', submissionType)
        .gte('da', minDa)
        .limit(targetBacklinks)

      if (sitesError) throw sitesError

      if (!targetSites || targetSites.length === 0) {
        alert('No target sites found matching your criteria. Try lowering the minimum DA or choosing a different category.')
        setIsSubmitting(false)
        return
      }

      // 2. Create the parent Campaign
      const campaignName = `${template.name} for ${activeClient.name} (${submissionType})`
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          client_id: activeClient.id,
          department_id: (template as any).department_id ?? null,
          name: campaignName,
          type: 'backlink_campaign',
          status: 'running',
        })
        .select()
        .single()

      if (campaignError) throw campaignError

      // 2b. Create the parent Task for the UI
      const { data: parentTask, error: parentTaskError } = await supabase
        .from('tasks')
        .insert({
          client_id: activeClient.id,
          department_id: (template as any).department_id ?? null,
          title: campaignName,
          status: 'pending',
          output: { campaign_id: campaign.id }
        })
        .select()
        .single()

      if (parentTaskError) throw parentTaskError

      // 3. Fetch keywords
      const { data: keywords, error: keywordsError } = await supabase
        .from('keywords')
        .select('*')
        .eq('client_id', activeClient.id)

      if (keywordsError) throw keywordsError

      const activeKeywords = keywords && keywords.length > 0 ? keywords : [{ keyword: 'N/A' }]

      // 4. Prepare the atomic task_runs for the Hermes worker to pick up
      const taskRunsToInsert: any[] = []
      targetSites.forEach((site: any) => {
        activeKeywords.forEach((kw: any) => {
          taskRunsToInsert.push({
            client_id: activeClient.id,
            department_id: (template as any).department_id ?? null,
            workflow_template_id: template.id,
            status: 'pending',
            current_step_index: 0,
            state: {
              campaign_id: campaign.id,
              task_id: parentTask.id,
              client_target_url: `https://${clientTargetUrl.trim()}`,
              target_site: site.url,
              category: submissionType,
              min_da: minDa,
              keyword: kw.keyword,
            }
          })
        })
      })

      // 5. Bulk insert task_runs
      const { data: insertedTaskRuns, error: taskRunsError } = await supabase
        .from('task_runs')
        .insert(taskRunsToInsert)
        .select()

      if (taskRunsError) throw taskRunsError

      // Note: We no longer call `/api/workflows/execute`. Hermes will autonomously 
      // pick up task_runs where status = 'pending'.

      alert(`Campaign started! Queued ${taskRunsToInsert.length} workflow runs.`)
      router.push('/dashboard/tasks')
    } catch (err: any) {
      console.error(err)
      alert('Failed to start execution: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Count how many steps have a skill assigned
  const assignedCount = Object.keys(skillOverrides).length

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

        {/* Skill assignment summary */}
        {assignedCount > 0 && (
          <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-sm">⚡</span>
            <span className="text-xs text-amber-300 font-medium">
              {assignedCount} skill{assignedCount > 1 ? 's' : ''} assigned
            </span>
          </div>
        )}
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6">

        {/* Campaign Parameters */}
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800/50">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            Campaign Parameters
          </h3>

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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400 dark:text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <span>Target Backlinks (Max)</span>
              </label>
              <button onClick={() => setIsKeywordsModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                <List className="w-3.5 h-3.5" />
                Keywords
              </button>
            </div>
            <label className="text-xs text-gray-400 dark:text-gray-600 dark:text-gray-400 flex items-center justify-end">
              <span className="text-gray-500 dark:text-gray-500">Number</span>
            </label>
            <input
              type="number"
              value={targetBacklinks}
              onChange={e => setTargetBacklinks(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400 dark:text-gray-600 dark:text-gray-400 flex items-center justify-between">
              <span>Minimum Domain Authority (DA)</span>
              <span className="text-gray-500 dark:text-gray-500">1–100</span>
            </label>
            <input
              type="number"
              value={minDa}
              onChange={e => setMinDa(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400 dark:text-gray-600 dark:text-gray-400 flex items-center justify-between">
              <span>Submission Category</span>
              <span className="text-gray-500 dark:text-gray-500">Select</span>
            </label>
            <select
              value={submissionType}
              onChange={e => setSubmissionType(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="bookmarking">Bookmarking Sites</option>
              <option value="article_submission" disabled>Article Submission (Coming Soon)</option>
              <option value="web20" disabled>Web 2.0 (Coming Soon)</option>
              <option value="profile" disabled>Profile Backlinks (Coming Soon)</option>
              <option value="guest_post" disabled>Guest Post Outreach (Coming Soon)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
        <button
          onClick={handleStartExecution}
          disabled={isSubmitting}
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
    </div>
  )
}

