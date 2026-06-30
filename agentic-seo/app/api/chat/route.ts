import { NextRequest, NextResponse } from 'next/server'
import { buildClientSystemMessage } from '@/lib/agent/client'

const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:8000'
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, clientId, clientName, clientDomain, clientDescription, clientCategory, sessionId, taskId, department, stream = true } = body

    if (!messages || !clientId || !clientName || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const systemMessage = buildClientSystemMessage({ clientId, clientName, clientDomain, clientDescription, clientCategory, sessionId, department })

    console.log(`[Chat API] Sending request to Agent at ${AGENT_URL}`)
    console.log(`[Chat API] Client ID: ${clientId}, Session ID: ${sessionId}`)

    // Forward to Agent
    const agentResponse = await fetch(`${AGENT_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AGENT_API_KEY}`,
      },
      signal: request.signal,
      body: JSON.stringify({
        messages: [systemMessage, ...messages],
      }),
    })

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text()
      console.error(`[Chat API] Agent error: ${agentResponse.status} ${errorText}`)
      return NextResponse.json(
        { error: `Agent error: ${agentResponse.status} ${errorText}` },
        { status: 502 }
      )
    }
    
    console.log(`[Chat API] Agent connected successfully. Streaming: ${stream}`)

    if (!stream) {
      const data = await agentResponse.json()
      return NextResponse.json(data)
    }

    // Create a transform stream to parse Hermes SSE and re-emit our format
    const encoder = new TextEncoder()
    let prevEventType = ''

    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = agentResponse.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let isClosed = false

        let accumulatedContent = ''

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try { controller.enqueue(data) } catch (e) { console.error('Enqueue error:', e) }
          }
        }
        
        const safeClose = () => {
          if (!isClosed) {
            isClosed = true
            try { controller.close() } catch (e) { console.error('Close error:', e) }
          }
        }

        const saveAssistantMessage = async () => {
          if (!accumulatedContent) return
          try {
            console.log('[Chat API] Saving assistant message to DB (length:', accumulatedContent.length, ')')
            const { createServiceClient } = await import('@/lib/supabase/server')
            const supabase = createServiceClient()
            await supabase.from('chat_messages').insert({
              session_id: sessionId,
              client_id: clientId,
              role: 'assistant',
              content: accumulatedContent,
            })
            // Task update has been removed because seo-agent does not require it.
          } catch (e) {
            console.error('[Chat API] Failed to save assistant message:', e)
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue

              // Log raw data from Agent to debug streaming issues
              // console.log(`[Chat API Raw] ${trimmed}`)

              // Track event type
              if (trimmed.startsWith('event:')) {
                prevEventType = trimmed.slice(6).trim()
                continue
              }

              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6)
                if (data === '[DONE]') {
                  safeEnqueue(encoder.encode('data: [DONE]\n\n'))
                  safeClose()
                  await saveAssistantMessage()
                  return
                }

                try {
                  const parsed = JSON.parse(data)

                  // Custom tool progress event from Python Agent
                  if (prevEventType === 'agent.tool.progress' || parsed.tool) {
                    if (typeof parsed.tool !== 'object' || parsed.tool === null) {
                      console.warn('[Chat API] Malformed tool_progress chunk — skipping:', parsed)
                      prevEventType = ''
                      continue
                    }
                    const chunk = JSON.stringify({
                      type: 'tool_progress',
                      tool: parsed.tool,
                    })
                    safeEnqueue(encoder.encode(`data: ${chunk}\n\n`))
                    prevEventType = ''
                    continue
                  }

                  // Standard text delta
                  const delta = parsed.choices?.[0]?.delta?.content
                  if (delta) {
                    accumulatedContent += delta
                    const chunk = JSON.stringify({ type: 'text', content: delta })
                    safeEnqueue(encoder.encode(`data: ${chunk}\n\n`))
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
          safeClose()
          await saveAssistantMessage()
        } catch (err: any) {
          if (err.name === 'AbortError' || err.message?.includes('abort')) {
             console.log('[Chat API] Request aborted by client')
             safeClose()
             await saveAssistantMessage()
             return
          }
          console.error('[Chat API] Stream processing error:', err)
          const chunk = JSON.stringify({ type: 'error', error: String(err) })
          safeEnqueue(encoder.encode(`data: ${chunk}\n\n`))
          safeClose()
          await saveAssistantMessage()
        } finally {
          reader.releaseLock()
        }
      },
    })

    return new NextResponse(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('[Chat API] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}
