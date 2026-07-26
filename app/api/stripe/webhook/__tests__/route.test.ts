/**
 * @jest-environment node
 */

const constructEvent = jest.fn()
const subsRetrieve = jest.fn()
const customersRetrieve = jest.fn()

jest.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: (...a: any[]) => constructEvent(...a) },
    subscriptions: { retrieve: (...a: any[]) => subsRetrieve(...a) },
    customers: { retrieve: (...a: any[]) => customersRetrieve(...a) },
  }),
}))

const fromMock = jest.fn()
const adminCreateUser = jest.fn()
const adminListUsers = jest.fn()
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...a: any[]) => fromMock(...a),
    auth: {
      admin: {
        createUser: (...a: any[]) => adminCreateUser(...a),
        listUsers: (...a: any[]) => adminListUsers(...a),
      },
    },
  },
}))

import { POST } from '../route'

function makeReq(body: string, sig = 'sig') {
  return {
    text: async () => body,
    headers: { get: (k: string) => (k === 'stripe-signature' ? sig : null) },
  } as unknown as Request
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec'
  // Default: no pre-existing auth user, so the create path is exercised.
  adminListUsers.mockResolvedValue({ data: { users: [] }, error: null })
})

describe('stripe webhook POST', () => {
  it('returns 400 on invalid signature', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig')
    })
    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'Invalid signature' })
  })

  it('handles checkout.session.completed by creating user when none exists', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_1',
          subscription: 'sub_1',
          customer_details: { email: 'a@b.com' },
        },
      },
    })
    subsRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      items: {
        data: [
          {
            id: 'si_lic',
            price: { recurring: { usage_type: 'licensed' } },
          },
          {
            id: 'si_met',
            price: { recurring: { usage_type: 'metered' } },
          },
        ],
      },
      current_period_start: 1700000000,
      current_period_end: 1702000000,
    })
    customersRetrieve.mockResolvedValue({ metadata: { terms_accepted: 'true' } })

    const profilesSelectMaybe = jest.fn().mockResolvedValue({ data: null })
    const profilesEqSelect = jest.fn(() => ({ maybeSingle: profilesSelectMaybe }))
    const profilesIlike = jest.fn(() => ({ maybeSingle: profilesSelectMaybe }))
    const profilesSelect = jest.fn(() => ({
      eq: profilesEqSelect,
      ilike: profilesIlike,
    }))
    const profilesUpsert = jest.fn().mockResolvedValue({ error: null })
    const subsUpsert = jest.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((tbl: string) => {
      if (tbl === 'profiles') {
        return { select: profilesSelect, upsert: profilesUpsert }
      }
      if (tbl === 'subscriptions') {
        return { upsert: subsUpsert }
      }
      throw new Error('unknown table ' + tbl)
    })
    adminCreateUser.mockResolvedValue({
      data: { user: { id: 'new-user' } },
      error: null,
    })

    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(200)
    expect(adminCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', email_confirm: true }),
    )
    expect(profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-user',
        stripe_customer_id: 'cus_1',
        is_active: true,
        term_of_agreement: true,
      }),
      { onConflict: 'id' },
    )
    expect(subsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_1',
        subscription_item_id: 'si_lic',
        metered_item_id: 'si_met',
        status: 'active',
      }),
      { onConflict: 'stripe_subscription_id' },
    )
  })

  // Regression: a Dashboard-created / invoice-billed subscription emits no
  // checkout.session.completed. Before this branch existed, such a customer
  // was charged but never provisioned — .updated only UPDATEs a row keyed on
  // stripe_subscription_id, which matched nothing.
  it('provisions a subscription created outside Checkout', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_dash', customer: 'cus_dash' } },
    })
    subsRetrieve.mockResolvedValue({
      id: 'sub_dash',
      status: 'active',
      items: {
        data: [
          { id: 'si_lic', price: { recurring: { usage_type: 'licensed' } } },
          { id: 'si_met', price: { recurring: { usage_type: 'metered' } } },
        ],
      },
      current_period_start: 1700000000,
      current_period_end: 1702000000,
    })
    customersRetrieve.mockResolvedValue({ email: 'dash@b.com', metadata: {} })

    // No profiles row, but the auth user already exists — the common shape
    // for someone who signed up before being subscribed manually.
    const profilesSelectMaybe = jest.fn().mockResolvedValue({ data: null })
    const profilesSelect = jest.fn(() => ({
      eq: jest.fn(() => ({ maybeSingle: profilesSelectMaybe })),
      ilike: jest.fn(() => ({ maybeSingle: profilesSelectMaybe })),
    }))
    const profilesUpsert = jest.fn().mockResolvedValue({ error: null })
    const subsUpsert = jest.fn().mockResolvedValue({ error: null })
    fromMock.mockImplementation((tbl: string) => {
      if (tbl === 'profiles') return { select: profilesSelect, upsert: profilesUpsert }
      if (tbl === 'subscriptions') return { upsert: subsUpsert }
      throw new Error('unknown table ' + tbl)
    })
    adminListUsers.mockResolvedValue({
      data: { users: [{ id: 'existing-user', email: 'dash@b.com' }] },
      error: null,
    })

    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(200)
    // Reused the existing auth user rather than trying to create a duplicate.
    expect(adminCreateUser).not.toHaveBeenCalled()
    expect(subsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'existing-user',
        stripe_customer_id: 'cus_dash',
        stripe_subscription_id: 'sub_dash',
        subscription_item_id: 'si_lic',
        metered_item_id: 'si_met',
        status: 'active',
      }),
      { onConflict: 'stripe_subscription_id' },
    )
  })

  it('skips work when checkout session lacks customer or subscription', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { customer: null, subscription: null } },
    })
    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(200)
    expect(subsRetrieve).not.toHaveBeenCalled()
  })

  it('handles customer.subscription.deleted by deactivating profile', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_1',
          status: 'canceled',
          items: { data: [] },
        },
      },
    })
    const subsUpdateEq = jest.fn().mockResolvedValue({ error: null })
    const subsUpdate = jest.fn(() => ({ eq: subsUpdateEq }))
    const profilesUpdateEq = jest.fn().mockResolvedValue({ error: null })
    const profilesUpdate = jest.fn(() => ({ eq: profilesUpdateEq }))
    fromMock.mockImplementation((tbl: string) => {
      if (tbl === 'subscriptions') return { update: subsUpdate }
      if (tbl === 'profiles') return { update: profilesUpdate }
      throw new Error()
    })

    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(200)
    expect(subsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled' }),
    )
    expect(profilesUpdate).toHaveBeenCalledWith({ is_active: false })
  })

  it('handles invoice.payment_failed by setting past_due', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_x' } },
    })
    const eq = jest.fn().mockResolvedValue({ error: null })
    const update = jest.fn(() => ({ eq }))
    fromMock.mockImplementation(() => ({ update }))
    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ status: 'past_due' })
    expect(eq).toHaveBeenCalledWith('stripe_subscription_id', 'sub_x')
  })

  it('returns 500 when handler throws', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', items: { data: [] } } },
    })
    fromMock.mockImplementation(() => {
      throw new Error('db down')
    })
    const r = await POST(makeReq('{}'))
    expect(r.status).toBe(500)
  })
})
