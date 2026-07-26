/**
 * @jest-environment node
 */

const listUsers = jest.fn()
const updateUserById = jest.fn()
const upsert = jest.fn()
const fromMock = jest.fn((..._a: any[]) => ({ upsert }))

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

const retrieve = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: (...a: any[]) => retrieve(...a) } } }),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as unknown as Request
}

// A valid Stripe checkout session that proves purchase for the given email.
function paidSession(email: string) {
  return { payment_status: 'paid', status: 'complete', customer_details: { email } }
}

beforeEach(() => jest.clearAllMocks())

describe('setup-password POST', () => {
  it('returns 400 when email or password missing', async () => {
    const r = await POST(makeReq({}))
    expect(r.status).toBe(400)
  })

  it('returns 400 when session_id is missing (no proof of purchase)', async () => {
    const r = await POST(makeReq({ email: 'a@b', password: 'pw' }))
    expect(r.status).toBe(400)
    expect(retrieve).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('returns 403 when the checkout session is not paid', async () => {
    retrieve.mockResolvedValue({ payment_status: 'unpaid', status: 'open', customer_details: { email: 'a@b' } })
    const r = await POST(makeReq({ email: 'a@b', password: 'pw', session_id: 'cs_1' }))
    expect(r.status).toBe(403)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('returns 403 when the session email does not match', async () => {
    retrieve.mockResolvedValue(paidSession('someone@else.com'))
    const r = await POST(makeReq({ email: 'a@b', password: 'pw', session_id: 'cs_1' }))
    expect(r.status).toBe(403)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('returns 403 when the session cannot be retrieved', async () => {
    retrieve.mockRejectedValue(new Error('No such session'))
    const r = await POST(makeReq({ email: 'a@b', password: 'pw', session_id: 'cs_bad' }))
    expect(r.status).toBe(403)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('returns 404 when user is not in supabase yet', async () => {
    retrieve.mockResolvedValue(paidSession('a@b'))
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    const r = await POST(makeReq({ email: 'a@b', password: 'pw', session_id: 'cs_1' }))
    expect(r.status).toBe(404)
  })

  it('updates password, marks profile active, signs in', async () => {
    retrieve.mockResolvedValue(paidSession('a@b'))
    listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'a@b' }] },
      error: null,
    })
    updateUserById.mockResolvedValue({ error: null })
    upsert.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })

    const r = await POST(makeReq({ email: 'a@b', password: 'pw', session_id: 'cs_1' }))
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
    retrieve.mockResolvedValue(paidSession('a@b'))
    listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'a@b' }] },
      error: null,
    })
    updateUserById.mockResolvedValue({ error: null })
    upsert.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: { message: 'no' } })
    const r = await POST(makeReq({ email: 'a@b', password: 'pw', session_id: 'cs_1' }))
    expect(r.status).toBe(500)
  })
})
