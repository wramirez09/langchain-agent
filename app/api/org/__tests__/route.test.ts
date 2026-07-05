/**
 * @jest-environment node
 */

jest.mock('@/lib/api/sessionOrg', () => ({
  getSessionOrg: jest.fn(),
  canManage: (r: string) => r === 'owner' || r === 'admin',
}))
jest.mock('@/lib/db/repositories/org.repo', () => ({
  getOrg: jest.fn(),
  updateOrgName: jest.fn(),
}))

import { GET, PATCH } from '../route'
import { getSessionOrg } from '@/lib/api/sessionOrg'
import { getOrg, updateOrgName } from '@/lib/db/repositories/org.repo'

const sessionMock = getSessionOrg as jest.Mock
const getOrgMock = getOrg as jest.Mock
const updateMock = updateOrgName as jest.Mock

describe('/api/org', () => {
  beforeEach(() => {
    sessionMock.mockReset()
    getOrgMock.mockReset()
    updateMock.mockReset()
  })

  it('GET returns org profile + role', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'member' })
    getOrgMock.mockResolvedValue({ id: 'org1', name: 'Acme' })
    const r = await GET()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toEqual({ org: { id: 'org1', name: 'Acme' }, role: 'member' })
  })

  it('GET 401 when unauthenticated', async () => {
    sessionMock.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('PATCH renames the org for an owner', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'owner' })
    updateMock.mockResolvedValue({ error: null })
    const r = await PATCH({ json: async () => ({ name: 'Newco' }) } as any)
    expect(r.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith('org1', 'Newco')
  })

  it('PATCH 403 for a member', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'member' })
    const r = await PATCH({ json: async () => ({ name: 'Newco' }) } as any)
    expect(r.status).toBe(403)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('PATCH 400 on invalid body', async () => {
    sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1', role: 'owner' })
    const r = await PATCH({ json: async () => ({}) } as any)
    expect(r.status).toBe(400)
  })
})
