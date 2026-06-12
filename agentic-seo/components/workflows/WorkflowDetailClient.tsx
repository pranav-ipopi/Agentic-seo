'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { WorkflowTemplate, Client } from '@/lib/supabase/types'
import WorkflowVisualizer from './WorkflowVisualizer'
import RunConfigurationPanel from './RunConfigurationPanel'

interface WorkflowDetailClientProps {
  template: WorkflowTemplate
  clients: Client[]
}

export default function WorkflowDetailClient({
  template,
  clients,
}: WorkflowDetailClientProps) {
  const steps = (template.steps as any[]) ?? []

  // Which executable node is currently selected in the canvas
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null)

  return (
    <div className="flex h-full w-full bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* ── Left: Visualizer Canvas ── */}
      <div className="flex-1 min-w-0 h-full border-r border-gray-200 dark:border-gray-800 relative flex flex-col">

        {/* Back button — absolute so it floats over the canvas */}
        <div className="absolute top-0 left-0 right-0 p-5 z-10 pointer-events-none">
          <Link
            href="/dashboard/workflows"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900/80 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium transition-colors border border-gray-300 dark:border-gray-700/50 backdrop-blur-sm pointer-events-auto shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Templates
          </Link>
        </div>

        {/* React Flow canvas */}
        <div className="flex-1 relative w-full h-full">
          <div className="absolute inset-0">
            <WorkflowVisualizer
              steps={steps}
              selectedNodeIndex={selectedNodeIndex}
              onNodeSelect={setSelectedNodeIndex}
            />
          </div>
        </div>
      </div>

      {/* ── Right: Configuration Sidebar ── */}
      <RunConfigurationPanel
        template={template}
        clients={clients}
      />
    </div>
  )
}
