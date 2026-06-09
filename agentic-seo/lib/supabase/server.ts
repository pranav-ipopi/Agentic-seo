import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './types'

/**
 * Cookie-based server client — for use in API routes and Server Components
 * where the calling user's session must be preserved (RLS applies).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore
          }
        },
      },
    }
  )
}

/**
 * Service-role admin client — stateless, no cookies, bypasses RLS entirely.
 *
 * Use ONLY for trusted server-side automation (WorkflowRunner, background jobs).
 * NEVER expose this client to the browser or use it in user-facing API routes.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...  (from Supabase Dashboard → Settings → API)
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      '[createServiceClient] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase Dashboard → Settings → API → service_role key).'
    )
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
