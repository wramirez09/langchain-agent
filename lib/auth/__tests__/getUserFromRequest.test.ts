jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getUserFromRequest } from '../getUserFromRequest'

const mockedCookies = cookies as unknown as jest.Mock
const mockedCreateServerClient = createServerClient as jest.Mock

function makeReq(headers: Record<string, string> = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

describe('getUserFromRequest', () => {
  const oldEnv = process.env.NODE_ENV
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
    })
  })
  afterAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: oldEnv,
      configurable: true,
    })
  })

  it('returns dev user when bypass header set in development', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    })
    const user = await getUserFromRequest(makeReq({ 'x-dev-bypass': 'true' }))
    expect(user).toEqual({ id: 'dev-user-local', email: 'dev@local' })
    expect(mockedCreateServerClient).not.toHaveBeenCalled()
  })

  it('uses Bearer token path on mobile', async () => {
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockedCreateServerClient.mockReturnValue({ auth: { getUser } })

    const u = await getUserFromRequest(
      makeReq({ authorization: 'Bearer tok' }),
    )
    expect(u).toEqual({ id: 'u1' })
    const opts = mockedCreateServerClient.mock.calls[0][2]
    expect(opts.global.headers.Authorization).toBe('Bearer tok')
  })

  it('throws on Bearer when supabase returns error', async () => {
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    mockedCreateServerClient.mockReturnValue({ auth: { getUser } })
    await expect(
      getUserFromRequest(makeReq({ authorization: 'Bearer tok' })),
    ).rejects.toThrow(/Invalid token/)
  })

  it('uses cookie session when no bearer header', async () => {
    mockedCookies.mockReturnValue({ getAll: () => [], set: jest.fn() })
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: { id: 'web' } }, error: null })
    mockedCreateServerClient.mockReturnValue({ auth: { getUser } })

    const u = await getUserFromRequest(makeReq())
    expect(u).toEqual({ id: 'web' })
  })

  it('throws Unauthenticated when no session', async () => {
    mockedCookies.mockReturnValue({ getAll: () => [], set: jest.fn() })
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: null }, error: null })
    mockedCreateServerClient.mockReturnValue({ auth: { getUser } })
    await expect(getUserFromRequest(makeReq())).rejects.toThrow(
      'Unauthenticated',
    )
  })
})
