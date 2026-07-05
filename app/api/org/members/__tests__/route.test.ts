/**
 * @jest-environment node
 */

jest.mock('@/lib/api/sessionOrg', () => ({
  getSessionOrg: jest.fn(),
  canManage: (r: string) => r === 'owner' || r === 'admin',
}))
jest.mock('@/lib/db/repositories/org.repo', () => ({
  listMembers: jest.fn(),
  findUserIdByEmail: jest.fn(),
  getMembership: jest.fn(),
  setMembership: jest.fn(),
}))

import { GET, POST } from '../route'
import { getSessionOrg } from '@/lib/api/sessionOrg'
import { listMembers, findUserIdByEmail, getMembership, setMembership } from '@/lib/db/repositories/org.repo'

const sessionMock = getSessionOrg as jest.Mock
const listMock = listMembers as jest.Mock
const findMock = findUserIdByEmail as jest.Mock
const memMock = getMembership as jest.Mock
const setMock = setMembership as jest.Mock

const owner = { userId: 'u1', orgId: 'org1', role: 'owner' }

describe('/api/org/members', () => {
  beforeEach(() => {
    sessionMock.mockReset(); listMock.mockReset(); findMock.mockReset(); memMock.mockReset(); setMock.mockReset()
  })

  it('GET lists members (any member)', async () => {
    sessionMock.mockResolvedValue({ ...owner, role: 'member' })
    listMock.mockResolvedValue([{ user_id: 'u1', email: 'a@x', role: 'owner', created_at: 'x' }])
    const r = await GET()
    expect(r.status).toBe(200)
    expect((await r.json()).members).toHaveLength(1)
  })

  it('POST adds an existing user by email (owner/admin)', async () => {
    sessionMock.mockResolvedValue(owner)
    findMock.mockResolvedValue('u2')
    memMock.mockResolvedValue(null)
    setMock.mockResolvedValue({ error: null })
    const r = await POST({ json: async () => ({ email: 'b@x.com', role: 'admin' }) } as any)
    expect(r.status).toBe(201)
    expect(setMock).toHaveBeenCalledWith('org1', 'u2', 'admin')
  })

  it('POST 403 for a member', async () => {
    sessionMock.mockResolvedValue({ ...owner, role: 'member' })
    const r = await POST({ json: async () => ({ email: 'b@x.com' }) } as any)
    expect(r.status).toBe(403)
    expect(findMock).not.toHaveBeenCalled()
  })

  it('POST 404 when no account exists for the email', async () => {
    sessionMock.mockResolvedValue(owner)
    findMock.mockResolvedValue(null)
    const r = await POST({ json: async () => ({ email: 'ghost@x.com' }) } as any)
    expect(r.status).toBe(404)
  })

  it('POST 409 when already a member', async () => {
    sessionMock.mockResolvedValue(owner)
    findMock.mockResolvedValue('u2')
    memMock.mockResolvedValue('member')
    const r = await POST({ json: async () => ({ email: 'b@x.com' }) } as any)
    expect(r.status).toBe(409)
  })
})
