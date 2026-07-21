/**
 * @jest-environment node
 */

const resolveMock = jest.fn()
const rateMock = jest.fn()
const runAgentMock = jest.fn()
const accessMock = jest.fn()

jest.mock('@/lib/billing/apiAccess', () => ({
  userHasApiAccess: (...a: any[]) => accessMock(...a),
}))
jest.mock('@/lib/auth/resolveApiAuth', () => ({
  resolveApiAuth: (...a: any[]) => resolveMock(...a),
  touchApiKey: jest.fn(),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a: any[]) => rateMock(...a) }))
jest.mock('@/lib/handlers/runAgent', () => ({ runAgent: (...a: any[]) => runAgentMock(...a) }))
jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }))
// The v1 route pulls RequestBodySchema from the internal route, which imports
// the service-role client (throws at import without a key) — stub it.
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { POST } from '../route'

const req = (body: any = { messages: [{ role: 'user', content: 'hi' }] }) =>
  ({
    json: async () => body,
    headers: { get: () => null },
  } as any)

const authFor = (scopes: string[]) => ({
  ok: true,
  auth: { orgId: 'org1', apiKeyId: 'k1', createdBy: 'u1', environment: 'live', scopes, tier: 'standard' },
})
const okLimit = { success: true, limit: 60, remaining: 59, retryAfterSeconds: 0 }

describe('POST /api/v1/agents — gate rails', () => {
  beforeEach(() => {
    resolveMock.mockReset()
    rateMock.mockReset()
    runAgentMock.mockReset()
    accessMock.mockReset()
    accessMock.mockResolvedValue({ allowed: true, reason: 'ok' })
  })

  it('402 when the caller has no active subscription', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    accessMock.mockResolvedValue({ allowed: false, reason: 'no_subscription' })
    const r = await POST(req())
    expect(r.status).toBe(402)
    expect(rateMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
  })

  // The docs promise rate-limit headers only on responses that reached the
  // limiter. These early rejections consume no budget, so they must not carry
  // them — otherwise the published prose becomes a lie.
  it.each([
    ['401', () => resolveMock.mockResolvedValue({ ok: false, status: 401, code: 'unauthorized', message: 'x' })],
    ['403', () => resolveMock.mockResolvedValue(authFor(['chat']))],
    ['402', () => {
      resolveMock.mockResolvedValue(authFor(['agents']))
      accessMock.mockResolvedValue({ allowed: false, reason: 'no_subscription' })
    }],
  ])('%s carries no rate-limit headers (never reached the limiter)', async (_label, arrange) => {
    arrange()
    const r = await POST(req())
    expect(r.headers.get('X-RateLimit-Limit')).toBeNull()
    expect(r.headers.get('X-RateLimit-Remaining')).toBeNull()
    expect(r.headers.get('X-RateLimit-Reset')).toBeNull()
    expect(rateMock).not.toHaveBeenCalled()
  })

  it('401 for an invalid key (never runs the agent)', async () => {
    resolveMock.mockResolvedValue({ ok: false, status: 401, code: 'unauthorized', message: 'x' })
    const r = await POST(req())
    expect(r.status).toBe(401)
    expect(rateMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
  })

  it('403 when the key lacks the agents scope', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    const r = await POST(req())
    expect(r.status).toBe(403)
    expect(rateMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
  })

  it('429 when rate limited, with Retry-After', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    rateMock.mockResolvedValue({ success: false, limit: 60, remaining: 0, retryAfterSeconds: 42 })
    const r = await POST(req())
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('42')
    expect(runAgentMock).not.toHaveBeenCalled()
  })

  it('runs the agent as the org (source=api) on the happy path', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    rateMock.mockResolvedValue(okLimit)
    runAgentMock.mockResolvedValue(new Response('ok', { status: 200 }))

    const r = await POST(req())
    expect(r.status).toBe(200)
    expect(runAgentMock).toHaveBeenCalledTimes(1)
    const identity = runAgentMock.mock.calls[0][0].identity
    expect(identity).toMatchObject({ orgId: 'org1', apiKeyId: 'k1', source: 'api' })
  })

  it('defaults to buffered JSON (clientType "mobile")', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    rateMock.mockResolvedValue(okLimit)
    runAgentMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await POST(req({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(runAgentMock.mock.calls[0][0].clientType).toBe('mobile')
  })

  it('streams when the caller opts in with stream:true (clientType "api")', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    rateMock.mockResolvedValue(okLimit)
    runAgentMock.mockResolvedValue(new Response('stream', { status: 200 }))

    await POST(req({ messages: [{ role: 'user', content: 'hi' }], stream: true }))
    expect(runAgentMock.mock.calls[0][0].clientType).toBe('api')
  })

  it('treats a non-boolean stream value as false (buffered JSON, no 400)', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    rateMock.mockResolvedValue(okLimit)
    runAgentMock.mockResolvedValue(new Response('{}', { status: 200 }))

    const r = await POST(req({ messages: [{ role: 'user', content: 'hi' }], stream: 'yes' }))
    expect(r.status).toBe(200)
    expect(runAgentMock.mock.calls[0][0].clientType).toBe('mobile')
  })
})
