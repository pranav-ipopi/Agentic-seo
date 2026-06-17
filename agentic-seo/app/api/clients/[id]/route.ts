import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const adminClient = createServiceClient()

  // First delete the client_members to avoid basic foreign key constraint errors
  await adminClient.from('client_members').delete().eq('client_id', id)
  // Also delete department members
  await adminClient.from('department_members').delete().eq('client_id', id)

  const { error } = await adminClient
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
  const adminClient = createServiceClient()

  const body = await request.json()
  const { name, domain, description, category } = body

  if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  const { data: updatedClient, error } = await adminClient
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
