import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the user is actually a member of this client
  const { data: membership } = await supabase
    .from('client_members')
    .select('id')
    .eq('client_id', id)
    .eq('user_id', user.id)
    .single()
    
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Import here to avoid circular dependencies or undefined issues if not top-level
  const { createServiceClient } = await import('@/lib/supabase/server')
  const adminClient = createServiceClient()

  // First delete the client_members to avoid basic foreign key constraint errors
  await adminClient.from('client_members').delete().eq('client_id', id)
  // Also delete department members
  await adminClient.from('department_members').delete().eq('client_id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any)
    .from('clients')
    .delete()
    .eq('id', id)
    
  if (error) {
    console.error('Error deleting client:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the user is a member of this client
  const { data: membership } = await supabase
    .from('client_members')
    .select('id')
    .eq('client_id', id)
    .eq('user_id', user.id)
    .single()
    
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, domain, description, category } = body

  if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedClient, error } = await (supabase as any)
    .from('clients')
    .update({ name, domain, description, category })
    .eq('id', id)
    .select()
    .single()
    
  if (error) {
    console.error('Error updating client:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(updatedClient)
}
