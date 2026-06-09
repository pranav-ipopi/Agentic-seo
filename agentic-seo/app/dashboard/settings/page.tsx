'use client'

import { useState, useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import { Loader2, Plus, Building2, Globe, Save, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/supabase/types'

export default function SettingsPage() {
  const supabase = createClient()
  const { activeClient, clients, setClients } = useClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'clients'>('profile')
  const [newClientName, setNewClientName] = useState('')
  const [newClientDomain, setNewClientDomain] = useState('')
  const [addingClient, setAddingClient] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('profiles').select('*').eq('id', user.id).single()
      if (data) { setProfile(data); setFullName(data.full_name ?? '') }
    }
    load()
  }, [])

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('profiles').update({ full_name: fullName }).eq('id', profile.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addClient() {
    if (!newClientName.trim()) return
    setAddingClient(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newClientName.trim(), domain: newClientDomain.trim() || null }),
    })
    if (res.ok) {
      const client = await res.json()
      setClients([...clients, client])
      setNewClientName('')
      setNewClientDomain('')
    }
    setAddingClient(false)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">Manage your profile and clients</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-0.5 mb-6 w-fit">
          {(['profile', 'clients'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors',
                activeTab === tab ? 'bg-indigo-600 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 mb-1.5">Full Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 mb-1.5">Role</label>
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400 capitalize">
                  {profile?.role?.replace('_', ' ') ?? '—'}
                </div>
              </div>
              

              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="space-y-4">
            {/* Existing clients */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Your Clients</h2>
              {clients.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-500">No clients yet. Add one below.</p>
              ) : (
                <div className="space-y-2">
                  {clients.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</div>
                        {c.domain && <div className="text-xs text-gray-500 dark:text-gray-500">{c.domain}</div>}
                      </div>
                      {activeClient?.id === c.id && (
                        <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new client */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Client</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 mb-1.5">Client Name *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
                    <input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      placeholder="Acme SaaS"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 mb-1.5">Domain</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
                    <input
                      value={newClientDomain}
                      onChange={(e) => setNewClientDomain(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      placeholder="acmesaas.com"
                    />
                  </div>
                </div>
                <button
                  onClick={addClient}
                  disabled={!newClientName.trim() || addingClient}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {addingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Client
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
