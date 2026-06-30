/**
 * Tests for POST /api/clients
 *
 * Validates Property 11 from the design:
 * For any POST /api/clients request, the inserted row MUST have
 * backlink_limit IS NOT NULL. The value MUST equal DEFAULT_BACKLINK_LIMIT
 * from environment (falling back to 50).
 *
 * **Validates: Requirements 2.14, 2.15**
 */

import { NextRequest } from 'next/server'

// --------------------------------------------------------------------------
// Mock @/lib/supabase/server BEFORE any import that touches the route.
// The mock must be declared at the top level so Jest hoists it correctly,
// and the mock factory must be stable across all tests (no resetModules).
// --------------------------------------------------------------------------
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
  createClient: jest.fn(),
}))

// next/headers is imported by the real createClient; mock it so ts-jest
// doesn't try to load Next.js internals.
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: () => [],
    set: jest.fn(),
  }),
}))

// --------------------------------------------------------------------------
// Helper: build a chainable Supabase admin mock that captures insert payload
// --------------------------------------------------------------------------
function buildAdminMock(insertCapture: { payload?: unknown }) {
  // profiles query mock (team-member insertion step)
  const profilesSelectMock = jest.fn().mockResolvedValue({ data: [], error: null })

  // client_members insert mock
  const clientMembersInsertMock = jest.fn().mockResolvedValue({ data: null, error: null })

  // clients insert chain: .insert(payload).select().single()
  const singleMock = jest.fn().mockResolvedValue({
    data: { id: 'client-1', name: 'Test', backlink_limit: 50 },
    error: null,
  })
  const selectAfterInsertMock = jest.fn().mockReturnValue({ single: singleMock })
  const insertMock = jest.fn().mockImplementation((payload: unknown) => {
    insertCapture.payload = payload
    return { select: selectAfterInsertMock }
  })

  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table === 'clients') return { insert: insertMock }
    if (table === 'profiles') return { select: profilesSelectMock }
    if (table === 'client_members') return { insert: clientMembersInsertMock }
    return {}
  })

  return { from: fromMock }
}

// --------------------------------------------------------------------------
// Helper: build a user-session client mock
// --------------------------------------------------------------------------
function buildUserMock() {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
      }),
    },
  }
}

// --------------------------------------------------------------------------
// Helper: build a NextRequest for POST /api/clients
// --------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/clients', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// --------------------------------------------------------------------------
// Import mocks at module level so they are always the hoisted versions
// --------------------------------------------------------------------------
import { createServiceClient, createClient } from '@/lib/supabase/server'

const mockCreateServiceClient = createServiceClient as jest.Mock
const mockCreateClient = createClient as jest.Mock

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe('POST /api/clients — backlink_limit insertion (Property 11)', () => {
  // Import the route once; the dynamic import inside it also resolves
  // to the mocked module because jest.mock hoists before any import.
  let POST: (req: NextRequest) => Promise<Response>

  beforeAll(async () => {
    const route = await import('@/app/api/clients/route')
    POST = route.POST
  })

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.DEFAULT_BACKLINK_LIMIT
  })

  afterEach(() => {
    delete process.env.DEFAULT_BACKLINK_LIMIT
  })

  it('inserts backlink_limit: 50 by default when DEFAULT_BACKLINK_LIMIT is unset', async () => {
    const insertCapture: { payload?: unknown } = {}
    mockCreateServiceClient.mockReturnValue(buildAdminMock(insertCapture))
    mockCreateClient.mockResolvedValue(buildUserMock())

    const response = await POST(makeRequest({ name: 'Acme', domain: 'acme.com' }))

    expect(response.status).toBe(201)
    expect(insertCapture.payload).toMatchObject({ backlink_limit: 50 })
  })

  it('uses DEFAULT_BACKLINK_LIMIT=100 from env when set', async () => {
    process.env.DEFAULT_BACKLINK_LIMIT = '100'

    const insertCapture: { payload?: unknown } = {}
    mockCreateServiceClient.mockReturnValue(buildAdminMock(insertCapture))
    mockCreateClient.mockResolvedValue(buildUserMock())

    const response = await POST(makeRequest({ name: 'Acme', domain: 'acme.com' }))

    expect(response.status).toBe(201)
    expect(insertCapture.payload).toMatchObject({ backlink_limit: 100 })
  })

  it('falls back to backlink_limit: 50 when DEFAULT_BACKLINK_LIMIT is invalid', async () => {
    process.env.DEFAULT_BACKLINK_LIMIT = 'not-a-number'

    const insertCapture: { payload?: unknown } = {}
    mockCreateServiceClient.mockReturnValue(buildAdminMock(insertCapture))
    mockCreateClient.mockResolvedValue(buildUserMock())

    const response = await POST(makeRequest({ name: 'Acme', domain: 'acme.com' }))

    expect(response.status).toBe(201)
    expect(insertCapture.payload).toMatchObject({ backlink_limit: 50 })
  })
})
