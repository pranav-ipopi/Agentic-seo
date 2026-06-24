import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientProvider } from '@/components/layout/ClientProvider'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import RightSidebar from '@/components/sidebar/RightSidebar'
import { Bell } from 'lucide-react'
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
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950 relative">
        {/* Left Sidebar — 260px */}
        <div className="w-[260px] flex-shrink-0 h-full overflow-hidden">
          <LeftSidebar />
        </div>

        {/* Center — chat workspace */}
        <main className="flex-1 min-w-0 h-full overflow-hidden bg-gray-50 dark:bg-gray-950">
          {children}
        </main>

        {/* Right Sidebar — Collapsed by default, expands over content on hover */}
        <div className="group h-full flex-shrink-0 w-[40px] z-40">
          <div className="absolute top-0 right-0 h-full w-[40px] group-hover:w-[300px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 transition-[width] duration-300 overflow-hidden shadow-sm group-hover:shadow-2xl">
            <div className="w-[300px] h-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col pointer-events-none group-hover:pointer-events-auto">
              <RightSidebar />
            </div>
            <div className="absolute top-0 right-0 w-[40px] h-full flex flex-col items-center py-[14px] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none border-l border-transparent">
              <div className="relative">
                <Bell className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientProvider>
  )
}
