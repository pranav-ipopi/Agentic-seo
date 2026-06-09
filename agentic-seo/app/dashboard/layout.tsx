import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientProvider } from '@/components/layout/ClientProvider'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import RightSidebar from '@/components/sidebar/RightSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workspace',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <ClientProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        {/* Left Sidebar — 260px */}
        <div className="w-[260px] flex-shrink-0 h-full overflow-hidden">
          <LeftSidebar />
        </div>

        {/* Center — chat workspace */}
        <main className="flex-1 min-w-0 h-full overflow-hidden bg-gray-50 dark:bg-gray-950">
          {children}
        </main>

        {/* Right Sidebar — 300px */}
        <div className="w-[300px] flex-shrink-0 h-full overflow-hidden">
          <RightSidebar />
        </div>
      </div>
    </ClientProvider>
  )
}
