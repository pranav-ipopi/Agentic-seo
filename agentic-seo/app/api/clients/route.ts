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

  const rawLimit = parseInt(process.env.DEFAULT_BACKLINK_LIMIT ?? '50', 10)
  const backlink_limit = isNaN(rawLimit) ? 50 : rawLimit

  const { data, error: clientError } = await supabaseAdmin
    .from('clients')
    .insert({ name, domain, description, category, created_by: user.id, backlink_limit } as any)
    .select()
    .single()

  const client = data as any;

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

  // Add ALL team members to client_members so everyone has access to the client
  const { data: users, error: usersError } = await supabaseAdmin.from('profiles').select('id')
  if (!usersError && users) {
    const memberInserts = users.map((u: any) => ({
      client_id: client.id,
      user_id: u.id
    }))
    const { error: memberError } = await supabaseAdmin
      .from('client_members')
      .insert(memberInserts as any)
    
    if (memberError) console.error('Failed to add team to client_members:', memberError)
  } else {
    console.error('Failed to fetch profiles to add to client_members:', usersError)
  }

  return NextResponse.json(client, { status: 201 })
}
