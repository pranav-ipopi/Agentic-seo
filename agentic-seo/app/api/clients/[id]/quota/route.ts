import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createServiceClient()
    const resolvedParams = await params
    const clientId = resolvedParams.id

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clientData, error: clientError } = await (adminClient as any)
      .from('clients')
      .select('backlink_limit, quota_reset_at')
      .eq('id', clientId)
      .single()

    if (clientError) throw clientError

    if (clientData?.backlink_limit === null || clientData?.backlink_limit === undefined) {
      return NextResponse.json({ limit: null, used: 0, remaining: null })
    }

    const limit = clientData.backlink_limit
    
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    
    let startOfCount = today.getTime()
    if (clientData.quota_reset_at) {
      const resetAt = new Date(clientData.quota_reset_at).getTime()
      if (resetAt > startOfCount) {
        startOfCount = resetAt
      }
    }
    const startOfCountISO = new Date(startOfCount).toISOString()

    const { count, error: countError } = await adminClient
      .from('task_runs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .neq('status', 'failed')
      .eq('type', 'backlink')
      .gte('created_at', startOfCountISO)

    if (countError) throw countError

    const used = count || 0
    const remaining = Math.max(0, limit - used)

    return NextResponse.json({ limit, used, remaining })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch quota' }, { status: 500 })
  }
}
