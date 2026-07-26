/**
 * @jest-environment node
 */

const exchangeCodeForSession = jest.fn()
jest.mock('@/utils/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: (...a: any[]) => exchangeCodeForSession(...a) },
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

describe('auth/callback GET', () => {
  it('redirects to error when code is missing', async () => {
    await expect(GET(makeReq('https://x/?next=/foo'))).rejects.toThrow(
      /REDIRECT:\/auth\/error/,
    )
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('exchanges the code and redirects to next on success', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    await expect(
      GET(makeReq('https://x/?code=abc&next=/auth/update-password')),
    ).rejects.toThrow('REDIRECT:/auth/update-password')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('defaults to /auth/update-password when next is not a relative path', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    await expect(
      GET(makeReq('https://x/?code=abc&next=https://evil')),
    ).rejects.toThrow('REDIRECT:/auth/update-password')
  })

  it('redirects to error when the exchange fails', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } })
    await expect(
      GET(makeReq('https://x/?code=abc')),
    ).rejects.toThrow(/REDIRECT:\/auth\/error\?error=bad%20code/)
  })
})
