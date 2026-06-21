'use client'

import { Bot, User, CheckCircle, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/supabase/types'

interface ToolStep {
  tool?: string
  name?: string
  status?: string
  state?: string
  message?: string
}

interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  toolProgress: ToolStep[]
  onPromptSelect?: (prompt: string) => void
}

const PROMPT_MAPPING: Record<string, string> = {
  'Find backlink opportunities': 'Analyze my website and identify high-quality backlink opportunities. Include relevant websites, directories, resource pages, guest posting prospects, and competitor backlink gaps that could improve my domain authority and rankings.',
  'Analyze competitor keywords': "Analyze my top competitors and identify the keywords they rank for that I don't. Highlight high-value, low-competition opportunities, estimated search volume, ranking difficulty, and content ideas to target these keywords.",
  'Audit technical SEO issues': 'Perform a technical SEO audit of my website. Identify issues affecting crawlability, indexing, site speed, mobile usability, Core Web Vitals, internal linking, structured data, redirects, and metadata. Prioritize fixes by impact.',
  'Research content gaps': "Compare my website's content against leading competitors and identify content gaps. Recommend topics, pages, and questions my audience is searching for that are currently missing from my site.",
  'Build a keyword cluster': 'Create a keyword cluster around my primary keyword. Organize related keywords into topic clusters, identify search intent, suggest pillar pages and supporting content, and recommend an internal linking structure to improve topical authority.',
}

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul]|<\/[hul])(.+)$/gm, '<p>$1</p>')
}

function ToolProgressCard({ steps }: { steps: ToolStep[] }) {
  if (steps.length === 0) return null
  return (
    <div className="mb-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
      <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
        Agent Working...
      </div>
      {steps.map((step, i) => {
        const status = step.status || step.state || 'failed'
        const toolName = step.tool || step.name || 'Unknown step'
        return (
          <div key={i} className="flex items-center gap-2.5 text-xs">
            {status === 'running' || status === 'started' ? (
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />
            ) : status === 'completed' ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            )}
            <span className={cn(
              'font-medium',
              status === 'completed' ? 'text-gray-400 dark:text-gray-600 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'
            )}>
              {toolName}
            </span>
            {step.message && (
              <span className="text-gray-500 dark:text-gray-500 truncate">{step.message}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ChatMessages({ messages, isStreaming, streamingContent, toolProgress, onPromptSelect }: ChatMessagesProps) {
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full py-20 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center mb-4">
          <Bot className="w-7 h-7 text-indigo-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Ready to work</h3>
        <p className="text-gray-500 dark:text-gray-500 text-sm max-w-sm leading-relaxed">
          Ask me to research keywords, analyse competitors, audit your site, find backlink opportunities, or plan content.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
          {Object.keys(PROMPT_MAPPING).map((promptLabel) => (
            <button
              key={promptLabel}
              onClick={() => onPromptSelect?.(PROMPT_MAPPING[promptLabel])}
              className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-full text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer hover:border-indigo-500/50 transition-colors"
            >
              {promptLabel}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            'flex gap-3 animate-fade-in',
            msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          {/* Avatar */}
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
            msg.role === 'user'
              ? 'bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600'
              : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm shadow-indigo-500/25'
          )}>
            {msg.role === 'user'
              ? <User className="w-4 h-4 text-gray-700 dark:text-gray-300" />
              : <Bot className="w-4 h-4 text-gray-900 dark:text-white" />
            }
          </div>

          {/* Bubble */}
          <div className={cn(
            'max-w-[80%] rounded-2xl px-4 py-3',
            msg.role === 'user'
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-tl-sm'
          )}>
            {msg.role === 'user' ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <div
                className="prose-ai text-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
            )}
          </div>
        </div>
      ))}

      {/* Streaming state container */}
      {isStreaming && (
        <div className="flex gap-3 animate-fade-in">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-indigo-500/25">
            <Bot className="w-4 h-4 text-gray-900 dark:text-white" />
          </div>
          
          <div className="flex-1 max-w-[80%]">
            {/* Tool progress during streaming */}
            {toolProgress.length > 0 && (
              <ToolProgressCard steps={toolProgress} />
            )}

            {/* Streaming assistant response or Loading Indicator */}
            {streamingContent ? (
              <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 inline-block">
                <div
                  className="prose-ai text-sm streaming-cursor"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
                />
              </div>
            ) : toolProgress.length === 0 ? (
              <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 inline-block">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
