import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const minDa = searchParams.get('minDa')
  const minPa = searchParams.get('minPa')
  const maxSpamScore = searchParams.get('maxSpamScore')
  const countOnly = searchParams.get('countOnly') === 'true'

  const adminClient = createServiceClient()
  let query = countOnly 
    ? adminClient.from('target_sites').select('*', { count: 'exact', head: true })
    : adminClient.from('target_sites').select('*').order('created_at', { ascending: true })
  
  if (category) query = query.eq('category', category)
  if (minDa !== null) query = query.gte('da', parseInt(minDa, 10))
  if (minPa !== null) query = query.gte('pa', parseInt(minPa, 10))
  if (maxSpamScore !== null) query = query.lte('spam_score', parseInt(maxSpamScore, 10))

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  if (countOnly) {
    return NextResponse.json({ count: count || 0 })
  }
  
  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const adminClient = createServiceClient()
  const body = await request.json()
  const { sites, category } = body

  if (!Array.isArray(sites)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  for (const site of sites) {
    const payload = {
      url: site.url,
      category: site.category || category,
      da: site.da,
      pa: site.pa,
      spam_score: site.spam_score
    }

    if (site.id) {
      await adminClient.from('target_sites').update(payload).eq('id', site.id)
    } else {
      await adminClient.from('target_sites').insert(payload)
    }
  }

  return NextResponse.json({ success: true })
}
