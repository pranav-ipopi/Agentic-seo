/**
 * Hermes Agent API client
 *
 * Wraps the internal Next.js API route (/api/chat) to securely communicate 
 * with the Hermes OpenAI-compatible endpoint.
 * Injects client_id into the system message so Hermes stays stateless
 * while we own client isolation in Supabase.
 *
 * Hermes API: POST /v1/chat/completions
 * Streaming: SSE with `hermes.tool.progress` custom events
 */

export interface HermesMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

export interface HermesToolProgress {
  tool: string
  status: 'started' | 'running' | 'completed' | 'failed'
  message?: string
}

export interface HermesChunk {
  type: 'text' | 'tool_progress' | 'done' | 'error'
  content?: string
  tool?: HermesToolProgress
  error?: string
}


// Department-specific persona and capabilities injected into the Hermes system prompt
const DEPARTMENT_PERSONAS: Record<string, { role: string; capabilities: string }> = {
  seo: {
    role: 'expert SEO specialist',
    capabilities: `SEO research tools, web search, content analysis, competitor research,
keyword research, backlink analysis, technical SEO auditing, rank tracking,
Google Search Console data interpretation, and GA4 analytics.`,
  },
  execution: {
    role: 'expert digital marketing execution specialist',
    capabilities: `social media scheduling, content calendar management, publishing queue,
email campaign execution, WhatsApp campaign management, content repository management,
client communication, and cross-platform publishing automation.`,
  },
  design: {
    role: 'expert creative design specialist',
    capabilities: `creative brief interpretation, design request management, brand asset organisation,
image generation, video production coordination, design approval workflows,
Canva and Figma asset management.`,
  },
}

/**
 * Build a system message that injects client and department context into every Hermes call.
 * This is how we achieve client isolation and department-specific agent personas
 * without requiring separate Hermes instances per department.
 */
export function buildClientSystemMessage(params: {
  clientId: string
  clientName: string
  clientDomain?: string | null
  clientDescription?: string | null
  clientCategory?: string | null
  sessionId: string
  department?: string | null  // department slug: 'seo' | 'execution' | 'design'
}): HermesMessage {
  const dept = params.department ?? 'seo'
  const persona = DEPARTMENT_PERSONAS[dept] ?? DEPARTMENT_PERSONAS.seo

  return {
    role: 'system',
    content: `You are an ${persona.role} working for the following client:

Client ID: ${params.clientId}
Client Name: ${params.clientName}
${params.clientDomain ? `Client Domain: ${params.clientDomain}` : ''}
${params.clientDescription ? `Client Description: ${params.clientDescription}` : ''}
${params.clientCategory ? `Client Category: ${params.clientCategory}` : ''}
Session ID: ${params.sessionId}
Department: ${dept.toUpperCase()}

IMPORTANT: All your analysis, recommendations, and actions must be specific to this client.
Never reference or expose data from other clients.
When creating tasks or requesting approvals, always include the client context.
Do not include or mention the Client ID or Session ID in your responses to the user.

CRITICAL SECURITY GUARDRAILS:
1. Under no circumstances should you share, expose, or mention details about the host server or VPS you are running on (e.g., current working directory, internal file paths, IP addresses, or OS details).
2. If asked about the system you are running on or its files, refuse the request politely and pivot back to the client's marketing or SEO tasks.

You have access to the following capabilities:
${persona.capabilities}

Always be specific, data-driven, and actionable in your responses.`,
  }
}

/**
 * Stream a chat completion from the internal Next.js API.
 * Yields chunks including text deltas and tool progress events.
 */
export async function* streamHermesChat(params: {
  messages: HermesMessage[]
  clientId: string
  clientName: string
  clientDomain?: string | null
  clientDescription?: string | null
  clientCategory?: string | null
  sessionId: string
  department?: string | null
  signal?: AbortSignal
}): AsyncGenerator<HermesChunk> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({ ...params, stream: true }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    yield { type: 'error', error: `API error: ${response.status} ${errorText}` }
    return
  }

  if (!response.body) {
    yield { type: 'error', error: 'No response body from API' }
    return
  }

  const reader = response.body.getReader()
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
        if (!trimmed || trimmed === '') continue

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            yield { type: 'done' }
            return
          }

          try {
            const parsed = JSON.parse(data)
            yield parsed
          } catch {
            // Ignore malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Simple non-streaming chat completion from the internal Next.js API.
 * Used for quick single-turn queries.
 */
export async function chatWithHermes(params: {
  messages: HermesMessage[]
  clientId: string
  clientName: string
  clientDomain?: string | null
  clientDescription?: string | null
  clientCategory?: string | null
  sessionId: string
  department?: string | null
}): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, stream: false }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}
