import { NextRequest, NextResponse } from 'next/server'
import { buildClientSystemMessage } from '@/lib/hermes/client'

const HERMES_URL = process.env.NEXT_PUBLIC_HERMES_URL ?? 'http://localhost:8642'
const HERMES_API_KEY = process.env.HERMES_API_KEY ?? ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, clientId, clientName, clientDomain, clientDescription, clientCategory, sessionId, department, stream = true } = body

    if (!messages || !clientId || !clientName || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const systemMessage = buildClientSystemMessage({ clientId, clientName, clientDomain, clientDescription, clientCategory, sessionId, department })

    console.log(`[Chat API] Sending request to Hermes at ${HERMES_URL}`)
    console.log(`[Chat API] Client ID: ${clientId}, Session ID: ${sessionId}`)

    // Forward to Hermes
    const hermesResponse = await fetch(`${HERMES_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HERMES_API_KEY}`,
      },
      signal: request.signal,
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: [systemMessage, ...messages],
        stream,
      }),
    })

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text()
      console.error(`[Chat API] Hermes error: ${hermesResponse.status} ${errorText}`)
      return NextResponse.json(
        { error: `Hermes error: ${hermesResponse.status} ${errorText}` },
        { status: 502 }
      )
    }
    
    console.log(`[Chat API] Hermes connected successfully. Streaming: ${stream}`)

    if (!stream) {
      const data = await hermesResponse.json()
      return NextResponse.json(data)
    }

    // Create a transform stream to parse Hermes SSE and re-emit our format
    const encoder = new TextEncoder()
    let prevEventType = ''

    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = hermesResponse.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let isClosed = false

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

              // Log raw data from Hermes to debug streaming issues
              console.log(`[Chat API Raw] ${trimmed}`)

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
                  return
                }

                try {
                  const parsed = JSON.parse(data)

                  // Hermes custom tool progress event
                  if (prevEventType === 'hermes.tool.progress' || parsed.tool) {
                    const chunk = JSON.stringify({
                      type: 'tool_progress',
                      tool: typeof parsed.tool === 'object' && parsed.tool !== null ? parsed.tool : parsed,
                    })
                    safeEnqueue(encoder.encode(`data: ${chunk}\n\n`))
                    prevEventType = ''
                    continue
                  }

                  // Standard text delta
                  const delta = parsed.choices?.[0]?.delta?.content
                  if (delta) {
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
        } catch (err: any) {
          if (err.name === 'AbortError' || err.message?.includes('abort')) {
             console.log('[Chat API] Request aborted by client')
             safeClose()
             return
          }
          console.error('[Chat API] Stream processing error:', err)
          const chunk = JSON.stringify({ type: 'error', error: String(err) })
          safeEnqueue(encoder.encode(`data: ${chunk}\n\n`))
          safeClose()
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
