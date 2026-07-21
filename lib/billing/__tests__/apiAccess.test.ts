/**
 * @jest-environment node
 */

let subResult: any = { data: null }

const from = jest.fn((_table: string) => {
  // subscriptions — keyed directly on the acting user's id
  return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(subResult) }) }) }
})
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: (t: any) => from(t) } }))

import { userHasApiAccess } from '@/lib/billing/apiAccess'

describe('userHasApiAccess', () => {
  beforeEach(() => {
    from.mockClear()
    subResult = { data: null }
  })

  it('allows any active subscriber — every plan includes the API', async () => {
    subResult = { data: { status: 'active' } }
    expect(await userHasApiAccess('u1')).toEqual({ allowed: true, reason: 'ok' })
  })

  it('allows a trialing subscriber', async () => {
    subResult = { data: { status: 'trialing' } }
    expect((await userHasApiAccess('u1')).allowed).toBe(true)
  })

  it('denies when there is no subscription', async () => {
    subResult = { data: null }
    expect(await userHasApiAccess('u1')).toEqual({
      allowed: false,
      reason: 'no_subscription',
    })
  })

  it.each(['canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])(
    'denies a %s subscription',
    async (status) => {
      subResult = { data: { status } }
      expect(await userHasApiAccess('u1')).toEqual({ allowed: false, reason: 'inactive' })
    },
  )

  it('denies a subscription with a null status rather than defaulting open', async () => {
    subResult = { data: { status: null } }
    expect((await userHasApiAccess('u1')).allowed).toBe(false)
  })

  // The old API_ACCESS_MODE switch is gone; no env var may re-open the gate.
  it('ignores a stray API_ACCESS_MODE=open in the environment', async () => {
    process.env.API_ACCESS_MODE = 'open'
    try {
      subResult = { data: null }
      expect((await userHasApiAccess('u1')).allowed).toBe(false)
      expect(from).toHaveBeenCalled() // still checks the DB
    } finally {
      delete process.env.API_ACCESS_MODE
    }
  })
})
