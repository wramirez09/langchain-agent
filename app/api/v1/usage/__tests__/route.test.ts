/**
 * @jest-environment node
 */

const resolveMock = jest.fn()
const rateMock = jest.fn()
const usageMock = jest.fn()

jest.mock('@/lib/auth/resolveApiAuth', () => ({
  resolveApiAuth: (...a: any[]) => resolveMock(...a),
}))
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...a: any[]) => rateMock(...a),
}))
jest.mock('@/lib/db/repositories/usage.repo', () => ({
  getUsageSummaryByOrgId: (...a: any[]) => usageMock(...a),
}))

import { GET } from '../route'

const validAuth = {
  ok: true,
  auth: { orgId: 'org-1', apiKeyId: 'k1', tier: 'standard', scopes: ['agents'], environment: 'live', createdBy: 'u1' },
}
const okLimit = { success: true, limit: 60, remaining: 59, retryAfterSeconds: 0 }

describe('GET /api/v1/usage', () => {
  beforeEach(() => {
    resolveMock.mockReset()
    rateMock.mockReset()
    usageMock.mockReset()
  })

  it('returns 401 for an invalid key and does not query usage', async () => {
    resolveMock.mockResolvedValue({ ok: false, status: 401, code: 'unauthorized', message: 'x' })
    const r = await GET({} as any)
    expect(r.status).toBe(401)
    expect(rateMock).not.toHaveBeenCalled()
    expect(usageMock).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    resolveMock.mockResolvedValue(validAuth)
    rateMock.mockResolvedValue({ success: false, limit: 60, remaining: 0, retryAfterSeconds: 30 })
    const r = await GET({} as any)
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('30')
    expect(usageMock).not.toHaveBeenCalled()
  })

  it('returns the org usage summary for the current month', async () => {
    resolveMock.mockResolvedValue(validAuth)
    rateMock.mockResolvedValue(okLimit)
    usageMock.mockResolvedValue({ total: 5, agents: 3, chat: 2 })
    const r = await GET({} as any)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json()
    expect(body.total).toBe(5)
    expect(body.agents).toBe(3)
    expect(body.chat).toBe(2)
    expect(typeof body.period_start).toBe('string')
    // usage scoped to the caller's org
    expect(usageMock).toHaveBeenCalledWith('org-1', expect.any(String))
  })
})
