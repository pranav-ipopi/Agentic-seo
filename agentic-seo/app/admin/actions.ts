'use server'

import { createServiceClient } from '@/lib/supabase/server'

export async function fetchAdminStats(password: string) {
  if (password !== 'ponytailadmin') {
    throw new Error('Unauthorized')
  }

  const supabase = createServiceClient()

  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .select('id, name, domain, backlink_limit')
    .order('name')

  if (clientsError) throw new Error(clientsError.message)

  const stats = await Promise.all((clientsData || []).map(async (client) => {
    const { count: completed } = await supabase
      .from('task_runs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'completed')
      .eq('type', 'backlink')

    const { count: failed } = await supabase
      .from('task_runs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'failed')
      .eq('type', 'backlink')

    const { count: pending } = await supabase
      .from('task_runs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .in('status', ['pending', 'running', 'waiting_approval'])
      .eq('type', 'backlink')

    return { 
      ...client, 
      completed: completed || 0, 
      failed: failed || 0, 
      pending: pending || 0
    }
  }))

  return stats
}

export async function updateAdminLimit(password: string, clientId: string, limit: number | null) {
  if (password !== 'ponytailadmin') {
    throw new Error('Unauthorized')
  }
  
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('clients')
    .update({ backlink_limit: limit })
    .eq('id', clientId)

  if (error) throw new Error(error.message)
  return true
}

export async function setGlobalLimit(password: string, limit: number | null) {
  if (password !== 'ponytailadmin') {
    throw new Error('Unauthorized')
  }
  
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('clients')
    .update({ backlink_limit: limit })
    .not('id', 'is', null) // Match all records

  if (error) throw new Error(error.message)
  return true
}
