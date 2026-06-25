import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { backlink_limit } = await request.json()
    const limitValue = backlink_limit === '' || backlink_limit === null ? null : parseInt(backlink_limit, 10)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('clients')
      .update({ backlink_limit: limitValue })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('[Update Client Limit] DB Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Update Client Limit] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
