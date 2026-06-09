import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Since RLS is enforced on the clients table, we can just query it directly.
  // The 'Members can view their clients' policy ensures users only see their clients.
  const { data, error } = await supabase.from('clients').select('*').order('name')
  
  if (error) {
    console.error('Supabase query error in GET /api/clients:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, domain, description } = body

  if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client, error: clientError } = await (supabase as any)
    .from('clients')
    .insert({ name, domain, description, created_by: user.id })
    .select()
    .single()

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

  // Add creator as member
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('client_members').insert({ client_id: client.id, user_id: user.id })

  return NextResponse.json(client, { status: 201 })
}
