'use server'

import { createServiceClient } from '@/lib/supabase/server'

const ADMIN_PASS = process.env.ADMIN_PASSWORD

export async function fetchAdminStats(password: string) {
  if (password !== ADMIN_PASS) {
    throw new Error('Unauthorized')
  }

  const supabase = createServiceClient()

  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .select('id, name, domain, backlink_limit')
    .order('name')

  if (clientsError) throw new Error(clientsError.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats = await Promise.all(((clientsData as any[]) || []).map(async (client: any) => {
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
  if (password !== ADMIN_PASS) {
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
  if (password !== ADMIN_PASS) {
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

export async function fetchAnalyticsData(password: string, days: number = 7) {
  if (password !== ADMIN_PASS) throw new Error('Unauthorized')
  
  const supabase = createServiceClient()

  // 1. Total jobs and currently running (from task_runs)
  const { count: totalJobs } = await supabase
    .from('task_runs')
    .select('*', { count: 'exact', head: true })
    
  const { count: currentlyRunning } = await supabase
    .from('task_runs')
    .select('*', { count: 'exact', head: true })
    .in('status', ['running', 'pending'])
    
  // 2. Graph view of executed backlinks over time (last X days)
  const d = new Date()
  d.setDate(d.getDate() - days)
  const { data: runsData } = await supabase
    .from('task_runs')
    .select('created_at, status')
    .eq('type', 'backlink')
    .gte('created_at', d.toISOString())
    
  const graphData: Record<string, { date: string, success: number, failed: number }> = {}
  
  // Initialize graph data for the last X days to ensure all days show up
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date()
    dt.setDate(dt.getDate() - i)
    // using local date string format YYYY-MM-DD
    const ds = dt.toLocaleDateString('en-CA')
    graphData[ds] = { date: ds, success: 0, failed: 0 }
  }

  if (runsData) {
    runsData.forEach((run: any) => {
      const dt = new Date(run.created_at)
      const ds = dt.toLocaleDateString('en-CA')
      if (graphData[ds]) {
        if (run.status === 'completed') graphData[ds].success++
        if (run.status === 'failed') graphData[ds].failed++
      }
    })
  }
  
  // 3. Worker health (PM2)
  let workerHealth = []
  try {
    const { execSync } = require('child_process')
    const stdout = execSync('pm2 jlist').toString()
    const pm2List = JSON.parse(stdout)
    workerHealth = pm2List.map((p: any) => ({
      name: p.name,
      status: p.pm2_env.status,
      restarts: p.pm2_env.restart_time,
      memory: Math.round(p.monit.memory / 1024 / 1024) + ' MB'
    }))
  } catch (e: any) {
    workerHealth = [{ name: 'PM2 Query Failed', status: 'error', restarts: 0, memory: 'N/A' }]
  }

  return {
    totalJobs: totalJobs || 0,
    currentlyRunning: currentlyRunning || 0,
    graphData: Object.values(graphData),
    workerHealth
  }
}
