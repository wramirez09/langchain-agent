/**
 * @jest-environment node
 */

// requireOrg → getSessionOrg under the hood; mock the session resolver.
const sessionMock = jest.fn()
jest.mock('@/lib/api/sessionOrg', () => ({
  getSessionOrg: (...a: any[]) => sessionMock(...a),
  canManage: (r: string) => r === 'owner' || r === 'admin',
}))
const accessMock = jest.fn()
jest.mock('@/lib/billing/apiAccess', () => ({
  userHasApiAccess: (...a: any[]) => accessMock(...a),
}))
jest.mock('@/lib/auth/apiKeys', () => ({
  generateApiKey: () => ({ plaintext: 'sk_test_ephemeral', hash: 'HASH', prefix: 'sk_test_ephe' }),
}))

// supabaseAdmin.from(...).insert(...).select(...).single()  and  .delete().eq()
const insertSingle = jest.fn()
const deleteEq = jest.fn().mockResolvedValue({ error: null })
const fromMock = jest.fn(() => ({
  insert: () => ({ select: () => ({ single: () => insertSingle() }) }),
  delete: () => ({ eq: (col: string, val: string) => deleteEq(col, val) }),
}))
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: () => fromMock() } }))

import { POST } from '../route'

const req = (body: any) =>
  ({
    json: async () => body,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'host' ? 'localhost:3000' : k.toLowerCase() === 'x-forwarded-proto' ? 'http' : null,
    },
  }) as any

const okSession = { userId: 'u1', orgId: 'org1', role: 'owner' }

describe('POST /api/playground', () => {
  const realFetch = global.fetch
  beforeEach(() => {
    sessionMock.mockReset()
    accessMock.mockReset()
    insertSingle.mockReset()
    deleteEq.mockClear()
    fromMock.mockClear()
    sessionMock.mockResolvedValue(okSession)
    accessMock.mockResolvedValue({ allowed: true, reason: 'ok' })
    insertSingle.mockResolvedValue({ data: { id: 'ephemeral-key-1' }, error: null })
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('401 when unauthenticated — never mints a key', async () => {
    sessionMock.mockResolvedValue(null)
    const r = await POST(req({ endpoint: 'me' }))
    expect(r.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('402 for a non-subscriber — gated before minting', async () => {
    accessMock.mockResolvedValue({ allowed: false, reason: 'no_subscription' })
    const r = await POST(req({ endpoint: 'agents' }))
    expect(r.status).toBe(402)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('400 on an unknown endpoint', async () => {
    const r = await POST(req({ endpoint: 'not-real' }))
    expect(r.status).toBe(400)
  })

  it('mints a key, proxies with a Bearer token, returns the response, then deletes the key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ org_id: 'org1', scopes: ['agents', 'chat'] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '59' },
      }),
    )
    global.fetch = fetchMock as any

    const r = await POST(req({ endpoint: 'me' }))
    const data = await r.json()

    // Called the real endpoint, same-origin, with the ephemeral Bearer key.
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/v1/me')
    expect(init.method).toBe('GET')
    expect(init.headers.authorization).toBe('Bearer sk_test_ephemeral')

    // Surfaced the upstream status, headers, and body.
    expect(data.response.status).toBe(200)
    expect(data.response.headers['x-ratelimit-remaining']).toBe('59')
    expect(data.response.body).toEqual({ org_id: 'org1', scopes: ['agents', 'chat'] })

    // Never leaks the real Authorization value back to the client.
    expect(JSON.stringify(data.request.headers)).not.toContain('sk_test_ephemeral')

    // Cleaned up the ephemeral key.
    expect(deleteEq).toHaveBeenCalledWith('id', 'ephemeral-key-1')
  })

  it('forwards a POST body with stream pinned off and an Idempotency-Key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { role: 'assistant', content: 'hi' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    global.fetch = fetchMock as any

    await POST(
      req({
        endpoint: 'chat',
        payload: { messages: [{ role: 'user', content: 'hi' }], stream: true },
        idempotencyKey: 'run-1',
      }),
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/v1/chat')
    expect(init.headers['idempotency-key']).toBe('run-1')
    // stream must be forced false regardless of what the user typed.
    expect(JSON.parse(init.body).stream).toBe(false)
  })

  it('deletes the ephemeral key even when the upstream call throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any
    const r = await POST(req({ endpoint: 'agents', payload: { messages: [] } }))
    expect(r.status).toBe(502)
    expect(deleteEq).toHaveBeenCalledWith('id', 'ephemeral-key-1')
  })
})
