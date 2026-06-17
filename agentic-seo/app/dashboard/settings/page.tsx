'use client'

import { useState, useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import { Loader2, Plus, Building2, Globe, Save, Check, Trash2, AlertTriangle, X, Pencil, Users } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Profile, Client } from '@/lib/supabase/types'

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
  const [newClientDescription, setNewClientDescription] = useState('')
  const [newClientCategory, setNewClientCategory] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)
  const [editClientName, setEditClientName] = useState('')
  const [editClientDomain, setEditClientDomain] = useState('')
  const [editClientDescription, setEditClientDescription] = useState('')
  const [editClientCategory, setEditClientCategory] = useState('')
  const [isUpdatingClient, setIsUpdatingClient] = useState(false)

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
      body: JSON.stringify({ 
        name: newClientName.trim(), 
        domain: newClientDomain.trim() || null,
        description: newClientDescription.trim() || null,
        category: newClientCategory || null
      }),
    })
    if (res.ok) {
      const client = await res.json()
      setClients([...clients, client])
      setNewClientName('')
      setNewClientDomain('')
      setNewClientDescription('')
      setNewClientCategory('')
    }
    setAddingClient(false)
  }

  async function confirmDeleteClient() {
    if (!clientToDelete) return
    if (deleteConfirmationName !== clientToDelete.name) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/clients/${clientToDelete.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setClients(clients.filter(c => c.id !== clientToDelete.id))
        setClientToDelete(null)
        setDeleteConfirmationName('')
      } else {
        const errData = await res.json()
        alert(`Failed to delete client: ${errData.error || res.statusText}`)
      }
    } catch (err: any) {
      alert(`An error occurred while deleting: ${err.message}`)
    }
    setIsDeleting(false)
  }

  async function saveEditedClient() {
    if (!clientToEdit || !editClientName.trim()) return
    setIsUpdatingClient(true)
    try {
      const res = await fetch(`/api/clients/${clientToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editClientName.trim(),
          domain: editClientDomain.trim() || null,
          description: editClientDescription.trim() || null,
          category: editClientCategory || null
        })
      })
      if (res.ok) {
        const updated = await res.json()
        setClients(clients.map(c => c.id === updated.id ? updated : c))
        setClientToEdit(null)
      } else {
        const errData = await res.json()
        alert(`Failed to update client: ${errData.error || res.statusText}`)
      }
    } catch (err: any) {
      alert(`An error occurred while updating: ${err.message}`)
    }
    setIsUpdatingClient(false)
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
              

              <div className="flex items-center gap-3">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved ? 'Saved!' : 'Save Changes'}
                </button>
                <Link
                  href="/dashboard/settings/team"
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Manage Team
                </Link>
              </div>
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
                        <div className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-2">
                          {c.domain && <span>{c.domain}</span>}
                          {c.domain && c.category && <span>•</span>}
                          {c.category && <span className="capitalize">{c.category}</span>}
                        </div>
                      </div>
                      {activeClient?.id === c.id && (
                        <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">Active</span>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setClientToEdit(c)
                            setEditClientName(c.name)
                            setEditClientDomain(c.domain || '')
                            setEditClientDescription(c.description || '')
                            setEditClientCategory(c.category || '')
                          }}
                          className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-md transition-colors"
                          title="Edit client"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setClientToDelete(c)
                            setDeleteConfirmationName('')
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                          title="Delete client"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
                <div>
                  <label className="block text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 mb-1.5">Category</label>
                  <select
                    value={newClientCategory}
                    onChange={(e) => setNewClientCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors appearance-none"
                  >
                    <option value="">Select category...</option>
                    <option value="automotive">Automotive</option>
                    <option value="health">Health & Medical</option>
                    <option value="technology">Technology & SaaS</option>
                    <option value="ecommerce">E-commerce</option>
                    <option value="real-estate">Real Estate</option>
                    <option value="finance">Finance</option>
                    <option value="education">Education</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="travel">Travel</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 dark:text-gray-600 dark:text-gray-400 mb-1.5">Description</label>
                  <textarea
                    value={newClientDescription}
                    onChange={(e) => setNewClientDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                    placeholder="Brief description of the client"
                    rows={3}
                  />
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

      {/* Delete Confirmation Modal */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Delete Client</h3>
              </div>
              <button 
                onClick={() => setClientToDelete(null)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You are about to delete <span className="font-semibold text-gray-900 dark:text-white">{clientToDelete.name}</span>. This action cannot be undone and will permanently remove all associated data.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Please type <span className="font-bold">{clientToDelete.name}</span> to confirm.
                </label>
                <input
                  value={deleteConfirmationName}
                  onChange={(e) => setDeleteConfirmationName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
                  placeholder={clientToDelete.name}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setClientToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteClient}
                disabled={deleteConfirmationName !== clientToDelete.name || isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {clientToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Edit Client</h3>
              <button 
                onClick={() => setClientToEdit(null)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Client Name *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
                  <input
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Domain</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
                  <input
                    value={editClientDomain}
                    onChange={(e) => setEditClientDomain(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
                <select
                  value={editClientCategory}
                  onChange={(e) => setEditClientCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors appearance-none"
                >
                  <option value="">Select category...</option>
                  <option value="automotive">Automotive</option>
                  <option value="health">Health & Medical</option>
                  <option value="technology">Technology & SaaS</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="real-estate">Real Estate</option>
                  <option value="finance">Finance</option>
                  <option value="education">Education</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="travel">Travel</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea
                  value={editClientDescription}
                  onChange={(e) => setEditClientDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setClientToEdit(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedClient}
                disabled={!editClientName.trim() || isUpdatingClient}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isUpdatingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
