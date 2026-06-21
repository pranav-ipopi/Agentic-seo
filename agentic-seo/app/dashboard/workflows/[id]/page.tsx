import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { WorkflowTemplate, Client } from '@/lib/supabase/types'
import WorkflowDetailClient from '@/components/workflows/WorkflowDetailClient'

export const metadata = {
  title: 'Configure Workflow | Agentic SEO',
}

// Template data is global — cache indefinitely per workflow ID, no cookies needed
const getCachedTemplate = (id: string) =>
  unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await (supabase as any)
        .from('workflow_templates')
        .select('*')
        .eq('id', id)
        .single() as { data: WorkflowTemplate | null }
      return data
    },
    [`workflow-template-${id}`],
    { revalidate: false }
  )()

// client_members is per-user — pass userId as arg so each user gets their own cache entry
// Uses service client + explicit user_id filter instead of relying on RLS/cookies
const getCachedClients = (userId: string) =>
  unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data: memberData } = await supabase
        .from('client_members')
        .select('clients(*)')
        .eq('user_id', userId)
      const clients = memberData?.flatMap((m: any) =>
        m.clients ? [m.clients as Client] : []
      ) || []
      return clients
    },
    [`client-members-${userId}`],
    { revalidate: false }
  )()

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Only use cookie-based client for auth — no DB queries here
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Both cached fetches run in parallel, zero DB calls on repeat visits
  const [rawTemplate, clients] = await Promise.all([
    getCachedTemplate(id),
    getCachedClients(user.id),
  ])

  if (!rawTemplate) notFound()

  return (
    <WorkflowDetailClient
      template={rawTemplate}
      clients={clients}
    />
  )
}
