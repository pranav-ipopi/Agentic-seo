'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useClient } from '@/components/layout/ClientProvider'
import { createClient } from '@/lib/supabase/client'
import { streamAgentChat } from '@/lib/agent/client'
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toolProgress, setToolProgress] = useState<{ tool: string; status: 'started' | 'running' | 'completed' | 'failed'; message?: string }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [promptValue, setPromptValue] = useState('')

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Load session and messages
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;
    
    async function load() {
      const [sessionRes, messagesRes, tasksRes] = await Promise.all([
        supabase.from('chat_sessions').select('*').eq('id', sessionId).single(),
        supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true }),
        supabase
          .from('tasks')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(1)
      ])
      
      if (sessionRes.data) setSession(sessionRes.data)
      
      let currentMessages = messagesRes.data || []
      setMessages(currentMessages)
      
      const latestTask = tasksRes.data?.[0]
      if (latestTask && latestTask.status === 'running') {
        setIsStreaming(true)
        
        // Start polling for the backend's saved response
        pollingInterval = setInterval(async () => {
          const { data: newMsgs } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            
          if (newMsgs && newMsgs.length > currentMessages.length) {
            setMessages(newMsgs)
            currentMessages = newMsgs
            
            const lastMsg = newMsgs[newMsgs.length - 1]
            if (lastMsg.role === 'assistant') {
              setIsStreaming(false)
              if (pollingInterval) clearInterval(pollingInterval)
            }
          }
        }, 3000)
      }
    }
    
    load()
    
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [sessionId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleSend = useCallback(async (content: string) => {
    if (!activeClient) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let currentSession = session
    if (!currentSession) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          id: sessionId,
          client_id: activeClient.id,
          user_id: user.id,
          title: content.length > 50 ? content.slice(0, 47) + '...' : content
        })
        .select()
        .single()

      if (data) {
        currentSession = data
        setSession(data)
      } else {
        console.error('Failed to create session:', error)
        setErrorMessage('Failed to create chat session. Please try again.')
        setPromptValue(content)
        return
      }
    }

    setIsStreaming(true)
    setStreamingContent('')
    setErrorMessage(null)
    setToolProgress([])

    // Save user message
    const { data: userMsgData, error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        client_id: activeClient.id,
        role: 'user',
        content,
      })
      .select()
      .single()

    if (userMsgData) {
      setMessages((prev) => [...prev, userMsgData])
    } else {
      console.error('Failed to save message:', userMsgError)
      setErrorMessage('Failed to save your message. Please try again.')
      setPromptValue(content)
      setIsStreaming(false)
      return
    }

    // Task creation has been removed because seo-agent does not require it.
    // Build message history for Agent
    const agentMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    agentMessages.push({ role: 'user', content })

    let accumulated = ''
    let timeoutId: NodeJS.Timeout | null = null
    try {
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Auto-stop after 5 minutes
      timeoutId = setTimeout(() => {
        abortController.abort()
      }, 5 * 60 * 1000)

      const stream = streamAgentChat({
        messages: agentMessages,
        clientId: activeClient.id,
        clientName: activeClient.name,
        clientDomain: activeClient.domain,
        clientDescription: activeClient.description,
        clientCategory: activeClient.category,
        sessionId,
        taskId: undefined,
        department: 'seo', // Phase 1: SEO only. Will be dynamic in Phase 3.
        signal: abortController.signal
      })

      for await (const chunk of stream) {
        if (chunk.type === 'error') {
          throw new Error(chunk.error ?? 'Unknown error from Agent')
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

      // Update task status (removed)
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        console.log('Chat stream aborted by user')
      } else {
        console.error('Chat error:', err)
        setErrorMessage('Unable to reach the AI agent — check the agent service.')
        if (!accumulated) {
          accumulated = '⚠️ I encountered an error connecting to my core systems. Please check if the agent service is running and try again.'
        } else {
          accumulated += '\n\n*(Error: Connection to agent lost)*'
        }
      }
      // Fallback if backend failed to update the task (removed)
    } finally {
      // If agent returned nothing and no error was thrown
      if (!accumulated && abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        accumulated = "I'm sorry, I wasn't able to generate a response. Please try again."
      }

      if (accumulated) {
        // Just update local state so the user sees the message
        // DB saving is now robustly handled by the Next.js API route!
        setMessages((prev) => [
          ...prev, 
          {
            id: crypto.randomUUID(),
            session_id: sessionId,
            client_id: activeClient.id,
            role: 'assistant',
            content: accumulated,
            created_at: new Date().toISOString(),
            metadata: {}
          }
        ])

        // Update session title if first exchange
        if (messages.length === 0) {
          const title = content.length > 50 ? content.slice(0, 47) + '...' : content
          await supabase.from('chat_sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', sessionId)
          if (currentSession) setSession({ ...currentSession, title })
        }
      }

      if (timeoutId) clearTimeout(timeoutId)
      setIsStreaming(false)
      setStreamingContent('')
      setToolProgress([])
      abortControllerRef.current = null
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
            SEO Agent
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
          onPromptSelect={setPromptValue}
        />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900/50">
        {errorMessage && (
          <div
            role="alert"
            className="mb-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400"
          >
            {errorMessage}
          </div>
        )}
        <PromptInput
          value={promptValue}
          onChange={setPromptValue}
          onSend={handleSend}
          onStop={handleStop}
          disabled={isStreaming || !activeClient}
          clientName={activeClient.name}
        />
      </div>
    </div>
  )
}
