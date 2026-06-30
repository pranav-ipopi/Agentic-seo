/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatWorkspace from '@/components/chat/ChatWorkspace'

jest.mock('@/components/layout/ClientProvider', () => ({
  useClient: jest.fn()
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn()
}))



// Mock ChatMessages and PromptInput to isolate ChatWorkspace logic
jest.mock('@/components/chat/ChatMessages', () => () => <div data-testid="chat-messages" />)
jest.mock('@/components/chat/PromptInput', () => ({ onSend }: any) => (
  <button data-testid="send-btn" onClick={() => onSend('hello')}>Send</button>
))

import { useClient } from '@/components/layout/ClientProvider'
import { createClient } from '@/lib/supabase/client'


describe('ChatWorkspace Error Visibility (Property 12)', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock useClient
    ;(useClient as jest.Mock).mockReturnValue({
      activeClient: { id: 'client-1', name: 'Test Client' }
    })

    // Mock Supabase chain
    const singleMock = jest.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: singleMock })
    const selectMock = jest.fn().mockReturnValue({ single: singleMock, eq: eqMock })
    const insertMock = jest.fn().mockReturnValue({ select: selectMock })
    const updateMock = jest.fn().mockReturnValue({ eq: eqMock })
    const orderMock = jest.fn().mockResolvedValue({ data: [], error: null })
    const eqOrderMock = jest.fn().mockReturnValue({ order: orderMock })

    const fromMock = jest.fn().mockImplementation((table) => {
      if (table === 'chat_sessions') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: singleMock }) }), insert: insertMock, update: updateMock }
      if (table === 'chat_messages') return { select: jest.fn().mockReturnValue({ eq: eqOrderMock }), insert: insertMock }
      if (table === 'tasks') return { insert: insertMock, update: updateMock }
      return {}
    })

    ;(createClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: fromMock
    })
  })

  it('shows an alert when the stream yields an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('test 502')
    }) as jest.Mock

    render(<ChatWorkspace sessionId="session-1" />)

    // Wait for initial load
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Trigger send
    const sendBtn = screen.getByTestId('send-btn')
    await act(async () => {
      fireEvent.click(sendBtn)
      // wait for all promises in handleSend to resolve
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Assert the alert is visible
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Unable to reach the AI agent \u2014 check the Hermes service.')
  })

  it('shows no alert on a successful stream', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let count = 0
          return {
            read: jest.fn().mockImplementation(() => {
              count++
              if (count === 1) return Promise.resolve({ done: false, value: new TextEncoder().encode('data: {"type":"text","content":"hello "}\\n\\n') })
              if (count === 2) return Promise.resolve({ done: false, value: new TextEncoder().encode('data: {"type":"text","content":"world"}\\n\\n') })
              if (count === 3) return Promise.resolve({ done: false, value: new TextEncoder().encode('data: [DONE]\\n\\n') })
              return Promise.resolve({ done: true })
            })
          }
        }
      }
    }) as jest.Mock

    render(<ChatWorkspace sessionId="session-1" />)

    // Wait for initial load
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Trigger send
    const sendBtn = screen.getByTestId('send-btn')
    await act(async () => {
      fireEvent.click(sendBtn)
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Assert no alert is visible
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
