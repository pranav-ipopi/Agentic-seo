import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/browser-use/profiles
 *
 * Secure server-side proxy — fetches BrowserUse Cloud profiles using the
 * server-only BROWSER_USE_API_KEY env var so it never leaks to the client.
 *
 * Returns: Array of { id, name, created_at } profile objects
 */
export async function GET() {
  try {
    // Auth guard — must be logged in to fetch profiles
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.BROWSER_USE_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'BROWSER_USE_API_KEY is not configured on the server.' },
        { status: 500 }
      )
    }

    const res = await fetch('https://api.browser-use.com/api/v3/profiles', {
      headers: {
        'X-Browser-Use-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      // Don't cache — always fetch fresh list
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[BrowserUse Profiles] API error:', res.status, text)
      return NextResponse.json(
        { error: `BrowserUse API returned ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    // data may be { profiles: [...] } or [...] depending on API version
    const profiles = Array.isArray(data) ? data : (data.profiles ?? data.items ?? [])

    return NextResponse.json({ profiles })
  } catch (err: any) {
    console.error('[BrowserUse Profiles] Unexpected error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
