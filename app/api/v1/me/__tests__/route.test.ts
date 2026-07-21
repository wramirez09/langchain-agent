/**
 * @jest-environment node
 */

const resolveMock = jest.fn()
const rateMock = jest.fn()
jest.mock('@/lib/auth/resolveApiAuth', () => ({
  resolveApiAuth: (...a: any[]) => resolveMock(...a),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a: any[]) => rateMock(...a) }))

import { GET } from '../route'

const ALLOWED = {
  success: true,
  limit: 60,
  remaining: 59,
  retryAfterSeconds: 0,
  resetAtSeconds: 1_800_000_000,
}

describe('GET /api/v1/me', () => {
  beforeEach(() => {
    resolveMock.mockReset()
    rateMock.mockReset()
    rateMock.mockResolvedValue(ALLOWED)
  })

  it('returns 401 for an invalid key', async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'Invalid or missing API key.',
    })
    const r = await GET({} as any)
    expect(r.status).toBe(401)
    const body = await r.json()
    expect(body.error.code).toBe('unauthorized')
    expect(rateMock).not.toHaveBeenCalled() // auth first, no budget spent on bad keys
  })

  it('rate limits like every other endpoint', async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      auth: { orgId: 'org-1', createdBy: 'u1', apiKeyId: 'k1', environment: 'live', scopes: [], tier: 'standard' },
    })
    rateMock.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 7,
      resetAtSeconds: 1_800_000_007,
    })

    const r = await GET({} as any)
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('7')
    expect(r.headers.get('X-RateLimit-Reset')).toBe('1800000007')
    expect((await r.json()).error.code).toBe('rate_limited')
  })

  it('returns the key context for a valid key', async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      auth: {
        orgId: 'org-1',
        createdBy: 'u1',
        apiKeyId: 'k1',
        environment: 'live',
        scopes: ['agents', 'chat'],
        tier: 'standard',
      },
    })
    const r = await GET({} as any)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('X-RateLimit-Remaining')).toBe('59')
    expect(r.headers.get('X-RateLimit-Reset')).toBe('1800000000')
    expect(r.headers.get('Retry-After')).toBeNull() // only present on a 429
    const body = await r.json()
    expect(body).toEqual({
      org_id: 'org-1',
      environment: 'live',
      scopes: ['agents', 'chat'],
      rate_limit_tier: 'standard',
    })
  })
})
