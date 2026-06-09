'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Client } from '@/lib/supabase/types'

interface ClientContextValue {
  activeClient: Client | null
  setActiveClient: (client: Client | null) => void
  clients: Client[]
  setClients: (clients: Client[]) => void
}

const ClientContext = createContext<ClientContextValue | null>(null)

const STORAGE_KEY = 'agentic_seo_active_client'

export function ClientProvider({ children }: { children: ReactNode }) {
  const [activeClient, setActiveClientState] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])

  // Rehydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setActiveClientState(JSON.parse(stored))
      }
    } catch {}
  }, [])

  function setActiveClient(client: Client | null) {
    setActiveClientState(client)
    try {
      if (client) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(client))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {}
  }

  return (
    <ClientContext.Provider value={{ activeClient, setActiveClient, clients, setClients }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useClient must be used within ClientProvider')
  return ctx
}
