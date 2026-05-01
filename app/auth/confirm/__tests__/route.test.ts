/**
 * @jest-environment node
 */

const verifyOtp = jest.fn()
jest.mock('@/utils/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { verifyOtp: (...a: any[]) => verifyOtp(...a) },
  }),
}))

const redirectMock = jest.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

import { GET } from '../route'

function makeReq(url: string) {
  return { url } as any
}

beforeEach(() => jest.clearAllMocks())

describe('auth/confirm GET', () => {
  it('redirects to error when token_hash or type missing', async () => {
    await expect(GET(makeReq('https://x/?next=/foo'))).rejects.toThrow(
      /REDIRECT:\/auth\/error/,
    )
  })

  it('redirects to next path on successful verify', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    await expect(
      GET(makeReq('https://x/?token_hash=abc&type=signup&next=/agents')),
    ).rejects.toThrow('REDIRECT:/agents')
  })

  it('falls back to root when next is not an absolute path', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    await expect(
      GET(makeReq('https://x/?token_hash=abc&type=signup&next=https://evil')),
    ).rejects.toThrow('REDIRECT:/')
  })

  it('redirects to error on verifyOtp error', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    await expect(
      GET(makeReq('https://x/?token_hash=abc&type=signup')),
    ).rejects.toThrow(/REDIRECT:\/auth\/error\?error=expired/)
  })
})
