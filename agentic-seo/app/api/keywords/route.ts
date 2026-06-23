import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const targetUrl = searchParams.get('target_url')

  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

  const adminClient = createServiceClient()
  let query = adminClient
    .from('keywords')
    .select('*')
    .eq('client_id', clientId)

  if (targetUrl) {
    query = query.eq('target_url', targetUrl)
  }

  const { data, error } = await query.order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const adminClient = createServiceClient()
  const body = await request.json()
  const { keywords, clientId, targetUrl } = body

  if (!clientId || !Array.isArray(keywords)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Loop and upsert to bypass RLS
  for (const kw of keywords) {
    if (kw.id) {
      // @ts-ignore
      await adminClient.from('keywords').update({ keyword: kw.keyword, target_url: targetUrl || null } as any).eq('id', kw.id)
    } else {
      await adminClient.from('keywords').insert({ client_id: clientId, keyword: kw.keyword, target_url: targetUrl || null } as any)
    }
  }

  return NextResponse.json({ success: true })
}
