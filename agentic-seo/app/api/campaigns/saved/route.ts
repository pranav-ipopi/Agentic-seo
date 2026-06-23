import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const templateId = searchParams.get('template_id')

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
    }

    const adminClient = createServiceClient()
    let query = adminClient
      .from('saved_campaign_configs')
      .select('*, profiles:created_by (full_name)')
      .eq('client_id', clientId)

    if (templateId) {
      query = query.eq('template_id', templateId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Fetch saved campaigns error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { clientId, name, templateId, config } = body

    if (!clientId || !name || !templateId || !config) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const adminClient = createServiceClient()
    
    // Check if name already exists for this client and template
    const { data: existing } = await adminClient
       .from('saved_campaign_configs')
       .select('id')
       .eq('client_id', clientId)
       .eq('template_id', templateId)
       .eq('name', name)
       .single()

    let result;
    if (existing) {
       // Update
       const { data, error } = await adminClient
         .from('saved_campaign_configs')
         // @ts-ignore
         .update({ config, updated_at: new Date().toISOString() })
         // @ts-ignore
         .eq('id', existing.id)
         .select('*, profiles:created_by (full_name)')
         .single()
       if (error) throw error
       result = data;
    } else {
       // Insert
       const { data, error } = await adminClient
         .from('saved_campaign_configs')
         .insert({
           client_id: clientId,
           template_id: templateId,
           name,
           config,
           created_by: user.id
         } as any)
         .select('*, profiles:created_by (full_name)')
         .single()
       if (error) throw error
       result = data;
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('Save campaign error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
