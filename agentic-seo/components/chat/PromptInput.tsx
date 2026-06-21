'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import { Send, Loader2, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PromptInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  clientName?: string
  onStop?: () => void
  value?: string
  onChange?: (val: string) => void
}

export default function PromptInput({ onSend, disabled, clientName, onStop, value: externalValue, onChange: externalOnChange }: PromptInputProps) {
  const [localValue, setLocalValue] = useState('')
  const isControlled = externalValue !== undefined
  const value = isControlled ? externalValue : localValue
  const setValue = isControlled ? externalOnChange! : setLocalValue
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

  useEffect(() => {
    handleInput()
  }, [value, handleInput])



  return (
    <div className="space-y-2">
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
        <div className="flex items-center gap-2 flex-shrink-0 mb-1">
          {disabled && onStop && (
            <button
              id="stop-message-btn"
              onClick={onStop}
              title="Stop generating"
              className={cn(
                'p-2.5 rounded-xl transition-all',
                'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20'
              )}
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          )}

          <button
            id="send-message-btn"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            title="Send message (Enter)"
            className={cn(
              'p-2.5 rounded-xl transition-all',
              disabled || !value.trim()
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-gray-300 dark:border-gray-700'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 border border-indigo-500'
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
