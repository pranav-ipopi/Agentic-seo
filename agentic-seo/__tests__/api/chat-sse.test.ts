import { NextRequest } from 'next/server'

// Mock the lib module so we don't need real keys
jest.mock('@/lib/hermes/client', () => ({
  buildClientSystemMessage: jest.fn().mockReturnValue({ role: 'system', content: 'mock' })
}))

describe('Chat SSE API - Malformed Tool Progress (Property 13)', () => {
  let POST: any
  let originalFetch: any
  let consoleWarnMock: any
  let consoleLogMock: any

  beforeAll(async () => {
    const route = await import('@/app/api/chat/route')
    POST = route.POST
    originalFetch = global.fetch
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation()
    consoleLogMock = jest.spyOn(console, 'log').mockImplementation()
  })

  afterAll(() => {
    global.fetch = originalFetch
    consoleWarnMock.mockRestore()
    consoleLogMock.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function makeRequest(body: any) {
    return new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    })
  }

  async function consumeStream(stream: ReadableStream) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }
    return result
  }

  it('skips malformed tool progress and processes valid ones correctly', async () => {
    // Create a mock stream that sends:
    // 1. A malformed hermes.tool.progress event
    // 2. A well-formed hermes.tool.progress event
    // 3. [DONE]
    
    const streamPayload = [
      'event: hermes.tool.progress\n',
      'data: {"status":"ok"}\n\n',
      'event: hermes.tool.progress\n',
      'data: {"tool":{"tool":"web_search","status":"started"}}\n\n',
      'data: [DONE]\n\n'
    ].join('')

    const encoder = new TextEncoder()
    const mockReadableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(streamPayload))
        controller.close()
      }
    })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockReadableStream,
      status: 200
    })

    const req = makeRequest({
      messages: [{ role: 'user', content: 'hello' }],
      clientId: 'c1',
      clientName: 'name',
      clientDomain: 'domain',
      clientDescription: 'desc',
      clientCategory: 'cat',
      sessionId: 's1',
      department: 'dept'
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
    
    const bodyText = await consumeStream(response.body as ReadableStream)
    
    // Check if the warning was emitted for the malformed chunk
    expect(consoleWarnMock).toHaveBeenCalledWith(
      '[Chat API] Malformed tool_progress chunk \u2014 skipping:',
      { status: 'ok' }
    )

    // The output stream should only contain the valid tool chunk and DONE
    expect(bodyText).toContain('data: {"type":"tool_progress","tool":{"tool":"web_search","status":"started"}}')
    expect(bodyText).toContain('data: [DONE]')
    
    // It should NOT contain any chunk derived from the malformed payload
    // i.e. it shouldn't contain the raw tool_progress chunk where tool is undefined
    expect(bodyText).not.toContain('"tool":undefined')
  })
})
