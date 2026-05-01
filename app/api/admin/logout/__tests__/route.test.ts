/**
 * @jest-environment node
 */

const cookieDelete = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ delete: (...a: any[]) => cookieDelete(...a) }),
}))

import { POST } from '../route'

describe('admin logout POST', () => {
  it('deletes admin_session cookie', async () => {
    const r = await POST()
    expect(r.status).toBe(200)
    expect(cookieDelete).toHaveBeenCalledWith('admin_session')
  })
})
