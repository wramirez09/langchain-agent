/**
 * @jest-environment node
 */

jest.mock('@/lib/api/sessionOrg', () => ({ getSessionOrg: jest.fn() }))
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { GET, POST } from '../route'
import { getSessionOrg } from '@/lib/api/sessionOrg'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const sessionMock = getSessionOrg as jest.Mock
const fromMock = supabaseAdmin.from as jest.Mock

describe('/api/keys', () => {
  beforeEach(() => {
    sessionMock.mockReset()
    fromMock.mockReset()
  })

  describe('GET', () => {
    it('401 when not signed in', async () => {
      sessionMock.mockResolvedValue(null)
      const r = await GET()
      expect(r.status).toBe(401)
    })

    it("lists the caller's org keys (prefixes only)", async () => {
      sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1' })
      const eq = jest.fn(() => ({
        order: () => Promise.resolve({ data: [{ id: 'k1', key_prefix: 'sk_live_ab12' }], error: null }),
      }))
      fromMock.mockReturnValue({ select: () => ({ eq }) })

      const r = await GET()
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body.keys).toHaveLength(1)
      expect(eq).toHaveBeenCalledWith('org_id', 'org1') // scoped to caller's org
    })
  })

  describe('POST', () => {
    it('mints a key for the org and returns the plaintext once', async () => {
      sessionMock.mockResolvedValue({ userId: 'u1', orgId: 'org1' })
      let inserted: any
      fromMock.mockReturnValue({
        insert: (payload: any) => {
          inserted = payload
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'k1', key_prefix: payload.key_prefix }, error: null }),
            }),
          }
        },
      })

      const req = {
        json: async () => ({ name: 'Prod', environment: 'live', scopes: ['agents', 'chat'] }),
      } as any
      const r = await POST(req)
      expect(r.status).toBe(201)
      const body = await r.json()
      expect(body.key).toMatch(/^sk_live_/) // plaintext returned once
      expect(body.apiKey.id).toBe('k1')

      // hashed, org-scoped, attributed to the creator — never stores plaintext
      expect(inserted.org_id).toBe('org1')
      expect(inserted.created_by).toBe('u1')
      expect(inserted.key_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(inserted.key_hash).not.toBe(body.key)
    })

    it('401 when not signed in', async () => {
      sessionMock.mockResolvedValue(null)
      const r = await POST({ json: async () => ({}) } as any)
      expect(r.status).toBe(401)
    })
  })
})
