import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WorkflowTemplate, Client, Skill } from '@/lib/supabase/types'
import WorkflowDetailClient from '@/components/workflows/WorkflowDetailClient'

export const metadata = {
  title: 'Configure Workflow | Agentic SEO',
}

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Fetch template
  const { data: rawTemplate } = await (supabase as any)
    .from('workflow_templates')
    .select('*')
    .eq('id', id)
    .single() as { data: WorkflowTemplate | null }

  if (!rawTemplate) notFound()

  // 2. Fetch clients this user can access
  const { data: memberData } = await supabase
    .from('client_members')
    .select('clients(*)')

  const clients = memberData?.flatMap((m: any) =>
    m.clients ? [m.clients as Client] : []
  ) || []

  // 3. Fetch skills
  const { data: skills } = await supabase.from('skills').select('*').order('name')

  return (
    <WorkflowDetailClient
      template={rawTemplate}
      clients={clients}
      skills={(skills as Skill[]) || []}
    />
  )
}
