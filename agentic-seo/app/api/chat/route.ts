import { NextRequest, NextResponse } from 'next/server'
import { buildClientSystemMessage } from '@/lib/hermes/client'

const HERMES_URL = process.env.NEXT_PUBLIC_HERMES_URL ?? 'http://localhost:8642'
const HERMES_API_KEY = process.env.HERMES_API_KEY ?? ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, clientId, clientName, clientDomain, sessionId, department, stream = true } = body

    if (!messages || !clientId || !clientName || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const systemMessage = buildClientSystemMessage({ clientId, clientName, clientDomain, sessionId, department })

    // Forward to Hermes
    const hermesResponse = await fetch(`${HERMES_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HERMES_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: [systemMessage, ...messages],
        stream,
      }),
    })

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text()
      return NextResponse.json(
        { error: `Hermes error: ${hermesResponse.status} ${errorText}` },
        { status: 502 }
      )
    }

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

              // Track event type
              if (trimmed.startsWith('event:')) {
                prevEventType = trimmed.slice(6).trim()
                continue
              }

              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6)
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                  controller.close()
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
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
                    prevEventType = ''
                    continue
                  }

                  // Standard text delta
                  const delta = parsed.choices?.[0]?.delta?.content
                  if (delta) {
                    const chunk = JSON.stringify({ type: 'text', content: delta })
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        } catch (err) {
          const chunk = JSON.stringify({ type: 'error', error: String(err) })
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
          controller.close()
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
    console.error('Chat API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
