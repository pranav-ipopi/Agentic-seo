import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
  createClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: () => [],
    set: jest.fn(),
  }),
}))

import { createServiceClient, createClient } from '@/lib/supabase/server'
const mockCreateServiceClient = createServiceClient as jest.Mock
const mockCreateClient = createClient as jest.Mock

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

function makePatchRequest(url: string, body: any): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Clients Quota and Limit API Regression', () => {
  let GET_QUOTA: any
  let PATCH_LIMIT: any

  beforeAll(async () => {
    const quotaRoute = await import('@/app/api/clients/[id]/quota/route')
    const limitRoute = await import('@/app/api/clients/[id]/limit/route')
    GET_QUOTA = quotaRoute.GET
    PATCH_LIMIT = limitRoute.PATCH
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Task 34: GET /api/clients/[id]/quota returns { limit: 100 } unchanged
  it('GET /api/clients/[id]/quota returns unchanged backlink_limit', async () => {
    const singleMock = jest.fn().mockResolvedValue({
      data: { id: 'client-1', backlink_limit: 100 },
      error: null
    })
    
    const fromMock = jest.fn().mockImplementation((table: string) => {
      if (table === 'clients') {
        return { 
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: singleMock
            })
          }) 
        }
      }
      if (table === 'task_runs') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              neq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  gte: jest.fn().mockResolvedValue({
                    count: 5, error: null
                  })
                })
              })
            })
          })
        }
      }
      return {}
    })

    mockCreateServiceClient.mockReturnValue({ from: fromMock })
    mockCreateClient.mockResolvedValue({ 
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: fromMock
    })

    const req = makeGetRequest('http://localhost/api/clients/client-1/quota')
    const res = await GET_QUOTA(req, { params: { id: 'client-1' } })
    
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.limit).toBe(100)
  })

  // Task 35: PATCH /api/clients/[id]/limit setting to null stores NULL
  it('PATCH /api/clients/[id]/limit setting to null stores NULL', async () => {
    const updateCapture: { payload?: any } = {}
    
    const updateMock = jest.fn().mockImplementation((payload) => {
      updateCapture.payload = payload
      return { 
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', backlink_limit: null },
              error: null
            })
          })
        })
      }
    })

    const fromMock = jest.fn().mockImplementation((table: string) => {
      if (table === 'clients') return { update: updateMock }
      return {}
    })

    mockCreateServiceClient.mockReturnValue({ from: fromMock })
    mockCreateClient.mockResolvedValue({ 
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: fromMock
    })

    const req = makePatchRequest('http://localhost/api/clients/client-1/limit', { backlink_limit: null })
    const res = await PATCH_LIMIT(req, { params: { id: 'client-1' } })
    
    expect(res.status).toBe(200)
    expect(updateCapture.payload).toMatchObject({ backlink_limit: null })
  })
})
