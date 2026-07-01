'use server'

import { createServiceClient } from '@/lib/supabase/server'

const getAdminPass = () => process.env.ADMIN_PASSWORD

export async function fetchAdminStats(password: string) {
  if (password !== getAdminPass()) {
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
  if (password !== getAdminPass()) {
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
  if (password !== getAdminPass()) {
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

export async function resetClientQuota(password: string, clientId: string) {
  if (password !== process.env.ADMIN_PASSWORD) throw new Error('Unauthorized')
  
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('clients')
    .update({ quota_reset_at: new Date().toISOString() })
    .eq('id', clientId)

  if (error) throw new Error(error.message)
  return true
}

export async function resetGlobalQuota(password: string) {
  if (password !== process.env.ADMIN_PASSWORD) throw new Error('Unauthorized')
  
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('clients')
    .update({ quota_reset_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) throw new Error(error.message)
  return true
}

export async function fetchAnalyticsData(password: string, days: number = 7) {
  if (password !== getAdminPass()) {
    throw new Error('Unauthorized')
  }
  
  const supabase = createServiceClient()

  // 1. Today's jobs and currently running (from task_runs)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: todaysJobs } = await supabase
    .from('task_runs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString())
    
  const { count: currentlyRunning } = await supabase
    .from('task_runs')
    .select('*', { count: 'exact', head: true })
    .in('status', ['running', 'pending'])
    
  // 2. Graph view of executed backlinks over time (last X days)
  const d = new Date()
  d.setDate(d.getDate() - days)
  
  let runsData: any[] = []
  let page = 0
  while (true) {
    const { data } = await supabase
      .from('task_runs')
      .select('created_at, status')
      .gte('created_at', d.toISOString())
      .range(page * 1000, (page + 1) * 1000 - 1)
      
    if (data && data.length > 0) {
      runsData.push(...data)
      if (data.length < 1000) break
      page++
    } else {
      break
    }
  }
    
  const graphData: Record<string, { date: string, success: number, failed: number, pending: number, running: number }> = {}
  
  // Initialize graph data for the last X days to ensure all days show up
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date()
    dt.setDate(dt.getDate() - i)
    // using local date string format YYYY-MM-DD
    const ds = dt.toLocaleDateString('en-CA')
    graphData[ds] = { date: ds, success: 0, failed: 0, pending: 0, running: 0 }
  }

  if (runsData) {
    runsData.forEach((run: any) => {
      const dt = new Date(run.created_at)
      const ds = dt.toLocaleDateString('en-CA')
      if (graphData[ds]) {
        if (run.status === 'completed') graphData[ds].success++
        else if (run.status === 'failed') graphData[ds].failed++
        else if (run.status === 'pending' || run.status === 'waiting_approval') graphData[ds].pending++
        else if (run.status === 'running') graphData[ds].running++
      }
    })
  }
  
  // 3. Worker health (PM2)
  let workerHealth = []
  try {
    const { execSync } = require('child_process')
    // Attempt standard pm2, then fallback to npx pm2 if it fails
    let stdout = '';
    try {
      stdout = execSync(process.platform === 'win32' ? 'pm2.cmd jlist' : 'pm2 jlist').toString();
    } catch (innerE) {
      stdout = execSync('npx pm2 jlist').toString();
    }
    
    let pm2List = null
    const lines = stdout.split('\n')
    for (const line of lines) {
      if (line.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(line)
          if (Array.isArray(parsed)) {
            pm2List = parsed
            break
          }
        } catch(e) {}
      }
    }

    if (pm2List) {
      workerHealth = pm2List.map((p: any) => ({
        name: p.name,
        status: p.pm2_env.status,
        restarts: p.pm2_env.restart_time,
        memory: Math.round(p.monit.memory / 1024 / 1024) + ' MB'
      }))
    } else {
      workerHealth = [{ name: 'PM2 Query Failed (No JSON)', status: 'error', restarts: 0, memory: 'N/A' }]
    }
  } catch (e: any) {
    workerHealth = [{ name: 'PM2 Execution Failed', status: 'error', restarts: 0, memory: 'N/A' }]
  }

  return {
    todaysJobs: todaysJobs || 0,
    currentlyRunning: currentlyRunning || 0,
    graphData: Object.values(graphData),
    workerHealth
  }
}
