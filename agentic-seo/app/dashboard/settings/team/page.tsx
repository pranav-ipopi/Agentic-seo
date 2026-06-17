'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Plus, Mail, Users, Trash2 } from 'lucide-react'
import type { Profile } from '@/lib/supabase/types'

export default function TeamSettingsPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    async function loadMembers() {
      setLoading(true)
      try {
        const res = await fetch('/api/team')
        if (res.ok) {
          const data = await res.json()
          setMembers(data)
        }
      } catch (err) {
        console.error('Failed to load team members:', err)
      }
      setLoading(false)
    }
    loadMembers()
  }, [])

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setMessage(null)
    
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invite.')
      }
      
      setMessage({ text: `Invite sent to ${inviteEmail}`, type: 'success' })
      setInviteEmail('')
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setInviting(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="mb-6 flex items-center gap-2 text-gray-900 dark:text-white">
          <Users className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl font-bold">Team Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">Manage your team members and invitations</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Invite Form */}
          <div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Invite Member</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      placeholder="colleague@agency.com"
                    />
                  </div>
                </div>

                {message && (
                  <div className={`p-2.5 rounded-lg text-xs font-medium border ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20'}`}>
                    {message.text}
                  </div>
                )}

                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Send Invitation
                </button>
              </div>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Current Members</h2>
              
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No team members found.</p>
              ) : (
                <div className="space-y-3">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 border border-indigo-200 dark:border-indigo-800">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt="avatar" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                            {member.full_name?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {member.full_name || 'Unknown User'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 capitalize mt-0.5">
                          {member.role?.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
