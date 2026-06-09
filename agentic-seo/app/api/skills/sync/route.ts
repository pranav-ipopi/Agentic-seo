import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()

    // Enforce authentication (or optionally require admin role)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch inbuilt skills from Hermes API
    const hermesUrl = process.env.NEXT_PUBLIC_HERMES_URL || 'http://127.0.0.1:8642'
    const hermesKey = process.env.HERMES_API_KEY || ''

    const res = await fetch(`${hermesUrl}/v1/skills`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hermesKey}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Hermes API error: ${res.statusText}`)
    }

    const data = await res.json()
    // Hermes returns {"object": "list", "data": [...]}
    const hermesSkills = Array.isArray(data) ? data : (data.data || data.skills || [])

    // Map Hermes skill objects to our DB schema
    // Handle the properties based on what Hermes actually returns
    // According to the prompt:
    // Hermes returns an array with id, name, description, compatibleTypes, category etc?
    // Wait, let me check the existing HermesSkill interface in lib/workflows/skills.ts
    // The previous implementation had: id, name, description, compatibleTypes, category
    
    const recordsToInsert = hermesSkills.map((skill: any) => ({
      skill_id: skill.name || skill.id,
      name: skill.name || skill.id,
      description: skill.description || '',
      category: skill.category || 'research',
      compatible_types: skill.compatibleTypes || ['hermes_task', 'browser_use_task'],
      is_inbuilt: true,
      updated_at: new Date().toISOString()
    }))

    if (recordsToInsert.length > 0) {
      // Upsert using the Supabase client
      const { error: upsertError } = await supabase
        .from('skills')
        .upsert(recordsToInsert, { onConflict: 'skill_id' })

      if (upsertError) {
        throw upsertError
      }
    }

    return NextResponse.json({ success: true, count: recordsToInsert.length })
  } catch (error: any) {
    console.error('[Skills Sync Error]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
