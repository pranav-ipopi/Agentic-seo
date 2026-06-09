import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { WorkflowTemplate } from '@/lib/supabase/types'
import { Workflow, Play, Settings2, Sparkles, Network } from 'lucide-react'

export const metadata = {
  title: 'Workflows | Agentic SEO',
  description: 'Manage and execute SEO workflows',
}

export default async function WorkflowsPage() {
  const supabase = await createClient()

  // Fetch all workflow templates
  const { data: templates, error } = await supabase
    .from('workflow_templates')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-400" />
            Workflow Templates
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400 mt-1">
            Select a predefined SEO workflow to run for your clients.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            Failed to load workflow templates. Please check your database connection.
          </div>
        ) : templates?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 border border-gray-300 dark:border-gray-700">
              <Workflow className="w-8 h-8 text-gray-500 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No Templates Found</h3>
            <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              You haven't defined any workflow templates in the database yet. Run the Supabase migrations to seed initial data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates?.map((template: WorkflowTemplate) => (
              <Link 
                href={`/dashboard/workflows/${template.id}`}
                key={template.id} 
                className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:border-indigo-500/50 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-all duration-300 shadow-sm overflow-hidden block"
              >
                {/* Decorative glow */}
                <div className="absolute -inset-x-2 -inset-y-2 bg-gradient-to-br from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                <div className="flex items-start justify-between mb-4 relative">
                  <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 shadow-inner">
                    <Workflow className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md border border-gray-300 dark:border-gray-700">
                    Template
                  </span>
                </div>

                <div className="relative">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-indigo-300 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400 line-clamp-2 mb-6 h-10">
                    {template.description || 'No description provided.'}
                  </p>

                  <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 pt-4">
                    <div className="flex -space-x-2">
                      {/* Fake icons representing steps */}
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-900 flex items-center justify-center z-30 relative" title="Research">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-900 flex items-center justify-center z-20 relative" title="Configuration">
                        <Settings2 className="w-3 h-3 text-amber-400" />
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-900 flex items-center justify-center z-10 relative flex-shrink-0 text-[10px] font-bold text-gray-400 dark:text-gray-600 dark:text-gray-400">
                        +{Math.max(0, (template.steps as unknown[])?.length - 2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-indigo-500/25 active:scale-95 pointer-events-none">
                      <Play className="w-4 h-4" />
                      Run Workflow
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
