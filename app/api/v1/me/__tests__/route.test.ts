/**
 * @jest-environment node
 */

const resolveMock = jest.fn()
jest.mock('@/lib/auth/resolveApiAuth', () => ({
  resolveApiAuth: (...a: any[]) => resolveMock(...a),
}))

import { GET } from '../route'

describe('GET /api/v1/me', () => {
  beforeEach(() => resolveMock.mockReset())

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
    const body = await r.json()
    expect(body).toEqual({
      org_id: 'org-1',
      environment: 'live',
      scopes: ['agents', 'chat'],
      rate_limit_tier: 'standard',
    })
  })
})
