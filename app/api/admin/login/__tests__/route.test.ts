/**
 * @jest-environment node
 */

const cookieSet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ set: (...a: any[]) => cookieSet(...a) }),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as any
}

describe('admin login POST', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ADMIN_EMAIL = 'a@x'
    process.env.ADMIN_PASSWORD = 'pw'
  })

  it('returns 500 when admin creds not configured', async () => {
    delete process.env.ADMIN_EMAIL
    const r = await POST(makeReq({ email: 'a@x', password: 'pw' }))
    expect(r.status).toBe(500)
  })

  it('returns 401 on bad credentials', async () => {
    const r = await POST(makeReq({ email: 'wrong', password: 'pw' }))
    expect(r.status).toBe(401)
  })

  it('sets admin_session cookie on success', async () => {
    const r = await POST(makeReq({ email: 'a@x', password: 'pw' }))
    expect(r.status).toBe(200)
    expect(cookieSet).toHaveBeenCalledWith(
      'admin_session',
      '1',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    )
  })
})
