import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabaseAdmin = createServiceClient()

  // To allow all team members to see all clients (domain-wide sharing),
  // we bypass RLS using the service role key.
  const { data, error } = await supabaseAdmin.from('clients').select('*').order('name')
  
  if (error) {
    console.error('Supabase query error in GET /api/clients:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = createServiceClient()
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, domain, description, category } = body

  if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .insert({ name, domain, description, category, created_by: user.id })
    .select()
    .single()

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

  return NextResponse.json(client, { status: 201 })
}
