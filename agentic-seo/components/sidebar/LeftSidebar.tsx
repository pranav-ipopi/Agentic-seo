'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/components/layout/ClientProvider'
import {
  ChevronDown,
  Plus,
  MessageSquare,
  CheckSquare,
  Clock,
  Settings,
  LogOut,
  Building2,
  Search,
  Loader2,
  User,
  Workflow,
  MoreVertical,
  Trash2,
  Users,
} from 'lucide-react'
import { cn, getInitials, formatRelativeTime } from '@/lib/utils'
import type { Client, ChatSession, Profile } from '@/lib/supabase/types'
const NAV_ITEMS = [
  { href: '/dashboard/tasks', icon: CheckSquare, label: 'Tasks' },
  { href: '/dashboard/workflows', icon: Workflow, label: 'Workflows' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
]

export default function LeftSidebar() {
  const pathname = usePathname()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const { activeClient, setActiveClient, clients, setClients } = useClient()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ limit: number | null, used: number, remaining: number | null } | null>(null)
  const clientSelectorRef = useRef<HTMLDivElement>(null)
  // Cache sessions keyed by clientId to avoid re-fetching on client switch
  const sessionsCache = useRef<Record<string, ChatSession[]>>({})

  useEffect(() => {
    let intervalId: NodeJS.Timeout

    const fetchQuota = async () => {
      if (!activeClient) return
      try {
        const res = await fetch(`/api/clients/${activeClient.id}/quota`)
        if (res.ok) {
          const data = await res.json()
          setQuota(data)
        }
      } catch (err) {
        console.error('Failed to fetch quota', err)
      }
    }

    fetchQuota()
    intervalId = setInterval(fetchQuota, 15000)

    return () => clearInterval(intervalId)
  }, [activeClient])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      setOpenMenuId(null)
      if (clientSelectorRef.current && !clientSelectorRef.current.contains(e.target as Node)) {
        setClientOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (profileData) setProfile(profileData)

      // Load clients — serve from localStorage cache first (5-min TTL), then refresh in background
      const CLIENTS_CACHE_KEY = 'agentic_seo_clients_cache'
      const CLIENTS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
      try {
        const raw = localStorage.getItem(CLIENTS_CACHE_KEY)
        if (raw) {
          const { data: cachedClients, ts } = JSON.parse(raw)
          if (Date.now() - ts < CLIENTS_CACHE_TTL && Array.isArray(cachedClients) && cachedClients.length > 0) {
            setClients(cachedClients)
            setLoading(false)
          }
        }
      } catch {}

      try {
        const res = await fetch('/api/clients')
        if (res.ok) {
          const clientList = await res.json()
          setClients(clientList)
          localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify({ data: clientList, ts: Date.now() }))
        }
      } catch (err) {
        console.error('Failed to load clients', err)
      }

      setLoading(false)
    }
    load()
  }, [])

  // Auto-select first client or validate active client
  useEffect(() => {
    if (!loading && clients.length > 0) {
      if (!activeClient) {
        const stored = localStorage.getItem('agentic_seo_active_client')
        if (!stored) {
          setActiveClient(clients[0])
        }
      } else {
        const isValid = clients.some(c => c.id === activeClient.id)
        if (!isValid) {
          setActiveClient(clients[0])
        }
      }
    }
  }, [loading, clients, activeClient, setActiveClient])

  // Load sessions for active client — cached per clientId
  useEffect(() => {
    if (!activeClient) { setSessions([]); return }

    // Serve from cache immediately (no loading flash)
    if (sessionsCache.current[activeClient.id]) {
      setSessions(sessionsCache.current[activeClient.id])
      // Still refresh in background so new sessions appear
    }

    async function loadSessions() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', activeClient!.id)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20)
      const result = data ?? []
      sessionsCache.current[activeClient!.id] = result
      setSessions(result)
    }
    loadSessions()
  }, [activeClient?.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function createNewSession() {
    if (!activeClient) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('chat_sessions')
      .insert({ client_id: activeClient.id, user_id: user.id, title: 'New Session' })
      .select()
      .single()
    if (data) {
      setSessions((prev) => [data, ...prev])
      window.location.href = `/dashboard/chat/${data.id}`
    }
  }

  async function deleteSession(sessionId: string) {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    setOpenMenuId(null)
    const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId)
    if (error) {
      console.error('Error deleting session:', error)
      // Optionally could add a toast notification here
    }
    if (pathname === `/dashboard/chat/${sessionId}`) {
      window.location.href = '/dashboard/chat'
    }
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-500/20 text-purple-300',
    seo_manager: 'bg-blue-500/20 text-blue-300',
    seo_executive: 'bg-green-500/20 text-green-300',
    content_writer: 'bg-amber-500/20 text-amber-300',
  }

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Header — Client Selector */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <div className="relative" ref={clientSelectorRef}>
          <button
            id="client-selector"
            onClick={() => { setClientOpen(!clientOpen); setClientSearch('') }}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-750 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white shadow-sm">
              {activeClient ? getInitials(activeClient.name) : <Building2 className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {loading ? 'Loading...' : activeClient?.name ?? 'Select Client'}
              </div>
              {activeClient?.domain && (
                <div className="text-xs text-gray-500 dark:text-gray-500 truncate">{activeClient.domain}</div>
              )}
            </div>
            <ChevronDown className={cn('w-4 h-4 text-gray-400 dark:text-gray-600 dark:text-gray-400 flex-shrink-0 transition-transform', clientOpen && 'rotate-180')} />
          </button>

          {clientOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
              {/* Search bar */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600 focus-within:border-indigo-400 transition-colors">
                  <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <input
                    id="client-search-input"
                    type="text"
                    autoFocus
                    placeholder="Search clients…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none min-w-0"
                  />
                  {clientSearch && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setClientSearch('') }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const filtered = clients.filter((c) => {
                  const q = clientSearch.toLowerCase()
                  return (
                    c.name.toLowerCase().includes(q) ||
                    (c.domain ?? '').toLowerCase().includes(q)
                  )
                })
                return filtered.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-500">
                    {clients.length === 0 ? 'No clients yet' : 'No matching clients'}
                  </div>
                ) : (
                  <div className="py-1 max-h-44 overflow-y-auto">
                    {filtered.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => { setActiveClient(client); setClientOpen(false); setClientSearch('') }}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
                          activeClient?.id === client.id && 'bg-indigo-500/10 text-indigo-300'
                        )}
                      >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {getInitials(client.name)}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium text-gray-900 dark:text-white truncate">{client.name}</div>
                          {client.domain && <div className="text-xs text-gray-500 dark:text-gray-500 truncate">{client.domain}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })()}

              <div className="border-t border-gray-300 dark:border-gray-700 p-1">
                <Link
                  href="/dashboard/settings?tab=clients"
                  onClick={() => setClientOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Client
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Chat button */}
      <div className="p-3">
        <button
          id="new-chat-btn"
          onClick={createNewSession}
          disabled={!activeClient}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Nav items */}
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider px-2 mb-2 mt-2">
            Workspace
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-colors text-sm',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                    : 'text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <item.icon className={cn('w-4 h-4', isActive ? 'text-indigo-400' : 'text-gray-400 dark:text-gray-600')} />
                {item.label}
              </Link>
            )
          })}
          
          {/* Workflow Skills portal removed as per user request */}
        </div>

        {/* Chat sessions */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider px-2 mb-2">
            Recent Chats
          </div>
          {sessions.length === 0 && !loading && (
            <div className="text-center py-6 text-gray-400 dark:text-gray-600 text-sm">
              No sessions yet
            </div>
          )}
          {sessions.map((session) => {
            const isActive = pathname === `/dashboard/chat/${session.id}`
            const isMenuOpen = openMenuId === session.id
            
            return (
              <div
                key={session.id}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-colors group relative',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
                  isMenuOpen && 'z-50'
                )}
              >
                <Link
                  href={`/dashboard/chat/${session.id}`}
                  className="flex items-start gap-2.5 flex-1 min-w-0"
                >
                  <MessageSquare className={cn('w-4 h-4 mt-0.5 flex-shrink-0', isActive ? 'text-indigo-400' : 'text-gray-400 dark:text-gray-600')} />
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm truncate', isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300')}>
                      {session.title}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-600">{formatRelativeTime(session.updated_at)}</div>
                  </div>
                </Link>

                {/* Action Menu Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                    setOpenMenuId(isMenuOpen ? null : session.id);
                  }}
                  className={cn(
                    "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex-shrink-0",
                    isMenuOpen ? "opacity-100 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white" : "opacity-0 group-hover:opacity-100 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  )}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div 
                    className="absolute right-2 top-full mt-1 w-32 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
                    onClick={(e) => {
                      e.preventDefault();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.nativeEvent.stopImmediatePropagation();
                        deleteSession(session.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Quota Widget */}
      {activeClient && (
        <div className="px-3 pb-3">
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Daily Quota</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {quota ? (quota.limit === null ? 'Unlimited' : `${quota.remaining} left`) : '...'}
              </span>
            </div>
            {quota && quota.limit !== null && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2 overflow-hidden">
                <div 
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-500", 
                    quota.remaining === 0 ? "bg-red-500" : "bg-indigo-500"
                  )} 
                  style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} 
                />
              </div>
            )}
            <div className="text-[10px] text-gray-400 mt-1.5 text-right">
              {quota && quota.limit !== null ? `${quota.used} / ${quota.limit} used` : 'No limits applied'}
            </div>
          </div>
        </div>
      )}

      {/* Profile footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-medium text-gray-900 dark:text-white flex-shrink-0">
            {profile ? getInitials(profile.full_name ?? profile.id) : <User className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{profile?.full_name ?? 'User'}</div>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', roleColors[profile?.role ?? 'seo_executive'] ?? 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300')}>
              {profile?.role?.replace('_', ' ') ?? 'Loading...'}
            </span>
          </div>
          <Link
            href="/dashboard/settings/team"
            title="Team Settings"
            className="opacity-0 group-hover:opacity-100 text-gray-500 dark:text-gray-500 hover:text-indigo-400 transition-all p-1 rounded"
            aria-label="Team Settings"
          >
            <Users className="w-3.5 h-3.5" />
          </Link>
          <button
            id="sign-out-btn"
            onClick={handleSignOut}
            title="Sign out"
            className="opacity-0 group-hover:opacity-100 text-gray-500 dark:text-gray-500 hover:text-red-400 transition-all p-1 rounded"
            aria-label="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
