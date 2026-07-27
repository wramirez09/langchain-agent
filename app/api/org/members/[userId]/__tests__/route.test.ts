/**
 * @jest-environment node
 */

jest.mock('@/lib/api/sessionOrg', () => ({
  getSessionOrg: jest.fn(),
  canManage: (r: string) => r === 'owner' || r === 'admin',
}))
jest.mock('@/lib/db/repositories/org.repo', () => ({
  getMembership: jest.fn(),
  updateMemberRole: jest.fn(),
  removeMember: jest.fn(),
  countOwners: jest.fn(),
}))

import { PATCH, DELETE } from '../route'
import { getSessionOrg } from '@/lib/api/sessionOrg'
import { getMembership, updateMemberRole, removeMember, countOwners } from '@/lib/db/repositories/org.repo'

const sessionMock = getSessionOrg as jest.Mock
const memMock = getMembership as jest.Mock
const roleMock = updateMemberRole as jest.Mock
const rmMock = removeMember as jest.Mock
const ownersMock = countOwners as jest.Mock

const params = (userId: string) => ({ params: Promise.resolve({ userId }) })
const owner = { userId: 'u1', orgId: 'org1', role: 'owner' }

describe('/api/org/members/[userId]', () => {
  beforeEach(() => {
    sessionMock.mockReset(); memMock.mockReset(); roleMock.mockReset(); rmMock.mockReset(); ownersMock.mockReset()
  })

  describe('PATCH (role)', () => {
    it('owner changes a member role', async () => {
      sessionMock.mockResolvedValue(owner)
      memMock.mockResolvedValue('member')
      roleMock.mockResolvedValue({ error: null })
      const r = await PATCH({ json: async () => ({ role: 'admin' }) } as any, params('u2') as any)
      expect(r.status).toBe(200)
      expect(roleMock).toHaveBeenCalledWith('org1', 'u2', 'admin')
    })

    it('403 when an admin tries to change roles (owners only)', async () => {
      sessionMock.mockResolvedValue({ ...owner, role: 'admin' })
      const r = await PATCH({ json: async () => ({ role: 'member' }) } as any, params('u2') as any)
      expect(r.status).toBe(403)
    })

    it('409 when demoting the last owner', async () => {
      sessionMock.mockResolvedValue(owner)
      memMock.mockResolvedValue('owner')
      ownersMock.mockResolvedValue(1)
      const r = await PATCH({ json: async () => ({ role: 'member' }) } as any, params('u1') as any)
      expect(r.status).toBe(409)
      expect(roleMock).not.toHaveBeenCalled()
    })
  })

  describe('DELETE (remove)', () => {
    it('owner removes a member', async () => {
      sessionMock.mockResolvedValue(owner)
      memMock.mockResolvedValue('member')
      rmMock.mockResolvedValue({ error: null })
      const r = await DELETE({} as any, params('u2') as any)
      expect(r.status).toBe(200)
    })

    it('403 when an admin tries to remove an owner', async () => {
      sessionMock.mockResolvedValue({ ...owner, role: 'admin' })
      memMock.mockResolvedValue('owner')
      const r = await DELETE({} as any, params('u2') as any)
      expect(r.status).toBe(403)
    })

    it('409 when removing the last owner', async () => {
      sessionMock.mockResolvedValue(owner)
      memMock.mockResolvedValue('owner')
      ownersMock.mockResolvedValue(1)
      const r = await DELETE({} as any, params('u1') as any)
      expect(r.status).toBe(409)
      expect(rmMock).not.toHaveBeenCalled()
    })
  })
})
