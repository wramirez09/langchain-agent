/**
 * @jest-environment node
 */

const listUsers = jest.fn()
const updateUserById = jest.fn()
const upsert = jest.fn()
const fromMock = jest.fn(() => ({ upsert }))

jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: (...a: any[]) => listUsers(...a),
        updateUserById: (...a: any[]) => updateUserById(...a),
      },
    },
    from: (...a: any[]) => fromMock(...a),
  },
}))

const signInWithPassword = jest.fn()
jest.mock('@/app/utils/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { signInWithPassword: (...a: any[]) => signInWithPassword(...a) },
  }),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as unknown as Request
}

beforeEach(() => jest.clearAllMocks())

describe('setup-password POST', () => {
  it('returns 400 when email or password missing', async () => {
    const r = await POST(makeReq({}))
    expect(r.status).toBe(400)
  })

  it('returns 404 when user is not in supabase yet', async () => {
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    const r = await POST(makeReq({ email: 'a@b', password: 'pw' }))
    expect(r.status).toBe(404)
  })

  it('updates password, marks profile active, signs in', async () => {
    listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'a@b' }] },
      error: null,
    })
    updateUserById.mockResolvedValue({ error: null })
    upsert.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })

    const r = await POST(makeReq({ email: 'a@b', password: 'pw' }))
    expect(r.status).toBe(200)
    expect(updateUserById).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ password: 'pw', email_confirm: true }),
    )
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', email: 'a@b', is_active: true }),
    )
  })

  it('returns 500 when sign-in fails', async () => {
    listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'a@b' }] },
      error: null,
    })
    updateUserById.mockResolvedValue({ error: null })
    upsert.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: { message: 'no' } })
    const r = await POST(makeReq({ email: 'a@b', password: 'pw' }))
    expect(r.status).toBe(500)
  })
})
