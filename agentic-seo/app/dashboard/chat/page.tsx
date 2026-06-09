'use client'

import { Bot, Sparkles } from 'lucide-react'

export default function ChatIndexPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center mb-5">
        <Bot className="w-8 h-8 text-indigo-400" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Agentic SEO Workspace</h1>
      <p className="text-gray-400 dark:text-gray-600 dark:text-gray-400 text-sm max-w-md leading-relaxed mb-6">
        Select a client from the left sidebar and start a new chat to begin your SEO research.
        Hermes will handle the research, analysis, and automation.
      </p>
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-full px-4 py-2">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        Powered by Hermes Agent
      </div>
    </div>
  )
}
