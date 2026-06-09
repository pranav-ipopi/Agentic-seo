'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useClient } from '@/components/layout/ClientProvider'
import { createClient } from '@/lib/supabase/client'
import { streamHermesChat } from '@/lib/hermes/client'
import ChatMessages from '@/components/chat/ChatMessages'
import PromptInput from '@/components/chat/PromptInput'
import { Bot, Building2 } from 'lucide-react'
import type { ChatMessage, ChatSession } from '@/lib/supabase/types'
import { DEPARTMENT_IDS } from '@/lib/supabase/types'

interface ChatWorkspaceProps {
  sessionId: string
}

export default function ChatWorkspace({ sessionId }: ChatWorkspaceProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const { activeClient } = useClient()
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolProgress, setToolProgress] = useState<{ tool: string; status: 'started' | 'running' | 'completed' | 'failed'; message?: string }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load session and messages
  useEffect(() => {
    async function load() {
      const [sessionRes, messagesRes] = await Promise.all([
        supabase.from('chat_sessions').select('*').eq('id', sessionId).single(),
        supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true }),
      ])
      if (sessionRes.data) setSession(sessionRes.data)
      if (messagesRes.data) setMessages(messagesRes.data)
    }
    load()
  }, [sessionId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleSend = useCallback(async (content: string) => {
    if (!activeClient || !session) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setIsStreaming(true)
    setStreamingContent('')
    setToolProgress([])

    // Save user message
    const userMsgRes = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        client_id: activeClient.id,
        role: 'user',
        content,
      })
      .select()
      .single()
    if (userMsgRes.data) {
      setMessages((prev) => [...prev, userMsgRes.data!])
    }

    // Create task
    const taskRes = await supabase
      .from('tasks')
      .insert({
        client_id: activeClient.id,
        department_id: DEPARTMENT_IDS.SEO, // Phase 1: SEO only. Will be dynamic in Phase 3.
        session_id: sessionId,
        user_id: user.id,
        title: content.length > 60 ? content.slice(0, 57) + '...' : content,
        status: 'running',
      })
      .select()
      .single()

    // Build message history for Hermes
    const hermesMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    hermesMessages.push({ role: 'user', content })

    try {
      let accumulated = ''
      
      const stream = streamHermesChat({
        messages: hermesMessages,
        clientId: activeClient.id,
        clientName: activeClient.name,
        clientDomain: activeClient.domain,
        sessionId,
        department: 'seo', // Phase 1: SEO only. Will be dynamic in Phase 3.
      })

      for await (const chunk of stream) {
        if (chunk.type === 'error') {
          throw new Error(chunk.error ?? 'Unknown error from Hermes')
        }
        
        if (chunk.type === 'text' && chunk.content) {
          accumulated += chunk.content
          setStreamingContent(accumulated)
        } else if (chunk.type === 'tool_progress' && chunk.tool) {
          const toolData = chunk.tool
          setToolProgress((prev) => {
            const existing = prev.findIndex((t) => t.tool === toolData.tool)
            if (existing >= 0) {
              const updated = [...prev]
              updated[existing] = toolData
              return updated
            }
            return [...prev, toolData]
          })
        } else if (chunk.type === 'done') {
          break
        }
      }

      // Save assistant message
      if (accumulated) {
        const assistantMsgRes = await supabase
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            client_id: activeClient.id,
            role: 'assistant',
            content: accumulated,
          })
          .select()
          .single()
        if (assistantMsgRes.data) {
          setMessages((prev) => [...prev, assistantMsgRes.data!])
        }

        // Update session title if first exchange
        if (messages.length === 0) {
          const title = content.length > 50 ? content.slice(0, 47) + '...' : content
          await supabase.from('chat_sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', sessionId)
          if (session) setSession({ ...session, title })
        }
      }

      // Update task status
      if (taskRes.data) {
        await supabase
          .from('tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', taskRes.data.id)
      }
    } catch (err) {
      console.error('Chat error:', err)
      if (taskRes.data) {
        await supabase
          .from('tasks')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', taskRes.data.id)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setToolProgress([])
    }
  }, [activeClient, session, messages, sessionId])

  if (!activeClient) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-500">
        <Building2 className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">Select a client to start chatting</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-gray-900 dark:text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {session?.title ?? 'SEO Workspace'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-500">{activeClient.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            Hermes Active
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          toolProgress={toolProgress}
        />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900/50">
        <PromptInput
          onSend={handleSend}
          disabled={isStreaming || !activeClient}
          clientName={activeClient.name}
        />
      </div>
    </div>
  )
}
