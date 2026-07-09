/**
 * @jest-environment node
 */

const resolveMock = jest.fn()
const rateMock = jest.fn()
const runChatMock = jest.fn()
const accessMock = jest.fn()

jest.mock('@/lib/auth/resolveApiAuth', () => ({
  resolveApiAuth: (...a: any[]) => resolveMock(...a),
  touchApiKey: jest.fn(),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a: any[]) => rateMock(...a) }))
jest.mock('@/lib/billing/apiAccess', () => ({ orgHasApiAccess: (...a: any[]) => accessMock(...a) }))
jest.mock('@/lib/handlers/runChat', () => ({
  runChat: (...a: any[]) => runChatMock(...a),
  ChatStreamError: class ChatStreamError extends Error {},
}))
jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }))

import { POST } from '../route'

const req = (body: any = { messages: [{ role: 'user', content: 'hi' }] }) =>
  ({ json: async () => body, headers: { get: () => null } } as any)

const authFor = (scopes: string[]) => ({
  ok: true,
  auth: { orgId: 'org1', apiKeyId: 'k1', createdBy: 'u1', environment: 'live', scopes, tier: 'standard' },
})
const okLimit = { success: true, limit: 60, remaining: 59, retryAfterSeconds: 0 }
const stream = () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('hi')); c.close() } })

describe('POST /api/v1/chat — gate rails', () => {
  beforeEach(() => {
    resolveMock.mockReset(); rateMock.mockReset(); runChatMock.mockReset(); accessMock.mockReset()
    accessMock.mockResolvedValue({ allowed: true, reason: 'ok' })
  })

  it('401 for an invalid key (never runs chat)', async () => {
    resolveMock.mockResolvedValue({ ok: false, status: 401, code: 'unauthorized', message: 'x' })
    const r = await POST(req())
    expect(r.status).toBe(401)
    expect(rateMock).not.toHaveBeenCalled()
    expect(runChatMock).not.toHaveBeenCalled()
  })

  it('403 when the key lacks the chat scope', async () => {
    resolveMock.mockResolvedValue(authFor(['agents']))
    const r = await POST(req())
    expect(r.status).toBe(403)
    expect(runChatMock).not.toHaveBeenCalled()
  })

  it('402 when the org has no API access', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    accessMock.mockResolvedValue({ allowed: false, reason: 'no_subscription' })
    const r = await POST(req())
    expect(r.status).toBe(402)
    expect(runChatMock).not.toHaveBeenCalled()
  })

  it('429 when rate limited, with Retry-After', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    rateMock.mockResolvedValue({ success: false, limit: 60, remaining: 0, retryAfterSeconds: 42 })
    const r = await POST(req())
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('42')
    expect(runChatMock).not.toHaveBeenCalled()
  })

  it('400 on a body that fails validation (empty messages)', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    rateMock.mockResolvedValue(okLimit)
    const r = await POST(req({ messages: [] }))
    expect(r.status).toBe(400)
    expect(runChatMock).not.toHaveBeenCalled()
  })

  it('defaults to buffered JSON as the org (source=api)', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    rateMock.mockResolvedValue(okLimit)
    runChatMock.mockResolvedValue(stream())

    const r = await POST(req())
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(await r.json()).toEqual({ message: { role: 'assistant', content: 'hi' } })
    expect(runChatMock).toHaveBeenCalledTimes(1)
    expect(runChatMock.mock.calls[0][0].identity).toMatchObject({
      orgId: 'org1', apiKeyId: 'k1', source: 'api',
    })
  })

  it('streams text/plain when the caller opts in with stream:true', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    rateMock.mockResolvedValue(okLimit)
    runChatMock.mockResolvedValue(stream())

    const r = await POST(req({ messages: [{ role: 'user', content: 'hi' }], stream: true }))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/plain')
  })

  it('treats a non-boolean stream value as false (buffered JSON)', async () => {
    resolveMock.mockResolvedValue(authFor(['chat']))
    rateMock.mockResolvedValue(okLimit)
    runChatMock.mockResolvedValue(stream())

    const r = await POST(req({ messages: [{ role: 'user', content: 'hi' }], stream: 'yes' }))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('application/json')
  })
})
