/**
 * @jest-environment node
 */

let ownerResult: any = { data: { user_id: 'owner1' } }
let subResult: any = { data: null }

const from = jest.fn((table: string) => {
  if (table === 'organization_members') {
    return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(ownerResult) }) }) }) }
  }
  // subscriptions
  return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(subResult) }) }) }
})
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: (t: any) => from(t) } }))

import { orgHasApiAccess } from '@/lib/billing/apiAccess'

describe('orgHasApiAccess', () => {
  beforeEach(() => {
    from.mockClear()
    ownerResult = { data: { user_id: 'owner1' } }
    subResult = { data: null }
    delete process.env.API_ACCESS_MODE
  })

  // Prevent the mode from leaking into other test files in the same worker.
  afterEach(() => {
    delete process.env.API_ACCESS_MODE
  })

  it('open mode: always allowed, no DB hit', async () => {
    const r = await orgHasApiAccess('org1')
    expect(r.allowed).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  describe('subscription mode', () => {
    beforeEach(() => (process.env.API_ACCESS_MODE = 'subscription'))

    it('allows an active subscription', async () => {
      subResult = { data: { status: 'active', api_access: false, tier: null } }
      expect((await orgHasApiAccess('org1')).allowed).toBe(true)
    })

    it('denies when there is no subscription', async () => {
      subResult = { data: null }
      const r = await orgHasApiAccess('org1')
      expect(r).toEqual({ allowed: false, reason: 'no_subscription' })
    })

    it('denies an inactive subscription', async () => {
      subResult = { data: { status: 'canceled', api_access: true, tier: 'pro' } }
      const r = await orgHasApiAccess('org1')
      expect(r).toEqual({ allowed: false, reason: 'inactive' })
    })
  })

  describe('strict mode', () => {
    beforeEach(() => (process.env.API_ACCESS_MODE = 'strict'))

    it('allows an active subscription with api_access', async () => {
      subResult = { data: { status: 'active', api_access: true, tier: 'pro' } }
      expect((await orgHasApiAccess('org1')).allowed).toBe(true)
    })

    it('denies an active subscription without api_access', async () => {
      subResult = { data: { status: 'active', api_access: false, tier: 'basic' } }
      const r = await orgHasApiAccess('org1')
      expect(r).toEqual({ allowed: false, reason: 'tier_excluded' })
    })
  })
})
