import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

  const adminClient = createServiceClient()
  const { data, error } = await adminClient
    .from('keywords')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const adminClient = createServiceClient()
  const body = await request.json()
  const { keywords, clientId } = body

  if (!clientId || !Array.isArray(keywords)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Loop and upsert to bypass RLS
  for (const kw of keywords) {
    if (kw.id) {
      // @ts-ignore
      await adminClient.from('keywords').update({ keyword: kw.keyword } as any).eq('id', kw.id)
    } else {
      await adminClient.from('keywords').insert({ client_id: clientId, keyword: kw.keyword } as any)
    }
  }

  return NextResponse.json({ success: true })
}
