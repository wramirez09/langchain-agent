/**
 * @jest-environment node
 */

jest.mock('@/lib/api/sessionOrg', () => ({
  getSessionOrg: jest.fn(),
  canManage: (r: string) => r === 'owner' || r === 'admin',
}))
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { PATCH, DELETE } from '../route'
import { getSessionOrg } from '@/lib/api/sessionOrg'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const sessionMock = getSessionOrg as jest.Mock
const fromMock = supabaseAdmin.from as jest.Mock

// Chainable delete()...maybeSingle() that captures the org filter.
function deleteChain(result: any) {
  const calls: any = {}
  const chain: any = {
    delete: () => ((calls.deleted = true), chain),
    eq: (col: string, val: string) => ((calls[col] = val), chain),
    select: () => chain,
    maybeSingle: () => Promise.resolve(result),
  }
  return { chain, calls }
}

// Chainable update()...maybeSingle() that captures the soft-revoke payload.
function updateChain(result: any) {
  const calls: any = {}
  const chain: any = {
    update: (v: any) => ((calls.update = v), chain),
    eq: (col: string, val: string) => ((calls[col] = val), chain),
    is: () => chain,
    select: () => chain,
    maybeSingle: () => Promise.resolve(result),
  }
  return { chain, calls }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PATCH /api/keys/[id] (revoke)', () => {
  beforeEach(() => {
    sessionMock.mockReset()
    fromMock.mockReset()
  })

  it('401 when not signed in', async () => {
    sessionMock.mockResolvedValue(null)
    const r = await PATCH({} as any, params('k1') as any)
    expect(r.status).toBe(401)
  })

  it('soft-revokes a key scoped to the org', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'owner' })
    const { chain, calls } = updateChain({ data: { id: 'k1' }, error: null })
    fromMock.mockReturnValue(chain)

    const r = await PATCH({} as any, params('k1') as any)
    expect(r.status).toBe(200)
    expect(calls.update.revoked_at).toBeTruthy() // soft revoke, not a delete
    expect(calls.id).toBe('k1')
    expect(calls.org_id).toBe('org1') // tenant guard
  })

  it('404 when already revoked / not in the org', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'owner' })
    const { chain } = updateChain({ data: null, error: null })
    fromMock.mockReturnValue(chain)

    const r = await PATCH({} as any, params('k1') as any)
    expect(r.status).toBe(404)
  })

  it('403 when the caller is a read-only member', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'member' })
    const r = await PATCH({} as any, params('k1') as any)
    expect(r.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/keys/[id]', () => {
  beforeEach(() => {
    sessionMock.mockReset()
    fromMock.mockReset()
  })

  it('401 when not signed in', async () => {
    sessionMock.mockResolvedValue(null)
    const r = await DELETE({} as any, params('k1') as any)
    expect(r.status).toBe(401)
  })

  it('deletes a key scoped to the org', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'owner' })
    const { chain, calls } = deleteChain({ data: { id: 'k1' }, error: null })
    fromMock.mockReturnValue(chain)

    const r = await DELETE({} as any, params('k1') as any)
    expect(r.status).toBe(200)
    expect(calls.deleted).toBe(true) // hard delete, not a soft revoke
    expect(calls.id).toBe('k1')
    expect(calls.org_id).toBe('org1') // tenant guard
  })

  it('404 when the key is not in the caller’s org', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'owner' })
    const { chain } = deleteChain({ data: null, error: null })
    fromMock.mockReturnValue(chain)

    const r = await DELETE({} as any, params('k1') as any)
    expect(r.status).toBe(404)
  })

  it('403 when the caller is a read-only member', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'member' })
    const r = await DELETE({} as any, params('k1') as any)
    expect(r.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })
})
