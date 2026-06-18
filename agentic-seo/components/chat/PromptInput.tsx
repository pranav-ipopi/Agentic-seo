'use client'

import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { Send, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PromptInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  clientName?: string
}

const EXAMPLE_PROMPTS = [
  'Find backlink opportunities for this domain',
  'Analyze top 5 competitor keywords',
  'Run a technical SEO audit',
  'Research content gaps vs competitors',
  'Identify quick-win keyword opportunities',
]

export default function PromptInput({ onSend, disabled, clientName }: PromptInputProps) {
  const [value, setValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [])

  const handleAdvancedMode = () => {
    const url = process.env.NEXT_PUBLIC_HERMES_ADVANCED_UI_URL ?? 'http://localhost:8642'
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-2">
      {/* Quick suggestions */}
      {showSuggestions && value.length === 0 && (
        <div className="flex flex-wrap gap-1.5 animate-fade-in">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => { setValue(prompt); setShowSuggestions(false); textareaRef.current?.focus() }}
              className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 hover:border-indigo-500/50 rounded-lg text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            id="chat-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            disabled={disabled}
            rows={1}
            placeholder={
              disabled
                ? 'Hermes is thinking...'
                : clientName
                ? `Ask about ${clientName}'s SEO...`
                : 'Ask Hermes anything about SEO...'
            }
            className={cn(
              'w-full resize-none bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-500',
              'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
              'transition-colors min-h-[44px] max-h-[200px] leading-relaxed',
              disabled && 'opacity-60 cursor-not-allowed'
            )}
            style={{ scrollbarWidth: 'none' }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            id="advanced-mode-btn"
            onClick={handleAdvancedMode}
            title="Open Hermes Advanced UI"
            className="p-2.5 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 rounded-xl transition-all"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            id="send-message-btn"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            title="Send message (Enter)"
            className={cn(
              'p-2.5 rounded-xl transition-all',
              disabled || !value.trim()
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-gray-300 dark:border-gray-700'
                : 'bg-indigo-600 hover:bg-indigo-500 text-gray-900 dark:text-white shadow-sm shadow-indigo-600/30 border border-indigo-500'
            )}
          >
            {disabled
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
        Enter to send • Shift+Enter for new line
      </p>
    </div>
  )
}
