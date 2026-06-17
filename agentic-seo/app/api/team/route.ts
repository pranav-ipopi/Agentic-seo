import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabaseAdmin = createServiceClient()
    const { data: profiles, error } = await supabaseAdmin.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(profiles)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    const supabaseAdmin = createServiceClient()

    // Try to invite the user
    // This requires service role key and bypasses RLS
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    
    if (error) {
      if (error.message.includes('already registered')) {
        return NextResponse.json({ error: 'User already exists in the database.' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ success: true, user: data.user })
  } catch (error: any) {
    if (error.message?.includes('already registered')) {
      return NextResponse.json({ error: 'User already exists in the database.' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
