/**
 * @jest-environment node
 */

import { POST } from '../route'

function makeReq(body: any, throwOnJson = false) {
  return {
    json: async () => {
      if (throwOnJson) throw new Error('bad')
      return body
    },
  } as any
}

describe('accept-terms POST', () => {
  it('returns 400 on invalid email', async () => {
    const r = await POST(makeReq({ email: 'bad' }))
    expect(r.status).toBe(400)
  })

  it('returns 200 with email echoed back', async () => {
    const r = await POST(makeReq({ email: 'a@b.com' }))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toEqual({
      success: true,
      message: 'Terms acceptance recorded',
      email: 'a@b.com',
    })
  })

  it('returns 500 when body parsing throws', async () => {
    const r = await POST(makeReq(null, true))
    expect(r.status).toBe(500)
  })
})
