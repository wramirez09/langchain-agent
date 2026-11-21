/**
 * @jest-environment node
 */
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  hasAdminSession,
  verifyAdminSessionToken,
} from '../adminSession'

const ENV = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD = 'correct horse'
})

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const store = (value?: string) => ({
  get: (name: string) => (name === ADMIN_SESSION_COOKIE && value !== undefined ? { value } : undefined),
})

describe('admin session tokens', () => {
  it('accepts a token it minted', () => {
    const token = createAdminSessionToken()
    expect(token).toMatch(/^v1\.\d+\.[\w-]+\.[\w-]+$/)
    expect(verifyAdminSessionToken(token)).toBe(true)
    expect(hasAdminSession(store(token as string))).toBe(true)
  })

  it('mints a different token on every login', () => {
    expect(createAdminSessionToken()).not.toBe(createAdminSessionToken())
  })

  // The original vulnerability: the cookie was the literal "1".
  it('rejects the old hand-settable value "1"', () => {
    expect(verifyAdminSessionToken('1')).toBe(false)
    expect(hasAdminSession(store('1'))).toBe(false)
  })

  it('rejects a missing cookie', () => {
    expect(verifyAdminSessionToken(undefined)).toBe(false)
    expect(verifyAdminSessionToken(null)).toBe(false)
    expect(verifyAdminSessionToken('')).toBe(false)
    expect(hasAdminSession(store())).toBe(false)
  })

  it('rejects a token whose expiry was extended', () => {
    const [v, exp, nonce, sig] = (createAdminSessionToken() as string).split('.')
    expect(verifyAdminSessionToken(`${v}.${Number(exp) + 86400}.${nonce}.${sig}`)).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const token = createAdminSessionToken() as string
    const last = token.slice(-1)
    expect(verifyAdminSessionToken(token.slice(0, -1) + (last === 'A' ? 'B' : 'A'))).toBe(false)
  })

  it('rejects malformed tokens', () => {
    const [, exp, nonce, sig] = (createAdminSessionToken() as string).split('.')
    expect(verifyAdminSessionToken(`v2.${exp}.${nonce}.${sig}`)).toBe(false)
    expect(verifyAdminSessionToken(`v1.soon.${nonce}.${sig}`)).toBe(false)
    expect(verifyAdminSessionToken(`v1.${exp}..${sig}`)).toBe(false)
    expect(verifyAdminSessionToken(`v1.${exp}.${nonce}`)).toBe(false)
    expect(verifyAdminSessionToken(`v1.${exp}.${nonce}.${sig}.extra`)).toBe(false)
  })

  it('expires after the session lifetime', () => {
    const now = Date.UTC(2026, 0, 1)
    const token = createAdminSessionToken(now)
    expect(verifyAdminSessionToken(token, now + (ADMIN_SESSION_TTL_SECONDS - 1) * 1000)).toBe(true)
    expect(verifyAdminSessionToken(token, now + ADMIN_SESSION_TTL_SECONDS * 1000)).toBe(false)
  })

  it('signs every session out when the admin password changes', () => {
    const token = createAdminSessionToken()
    process.env.ADMIN_PASSWORD = 'new password'
    expect(verifyAdminSessionToken(token)).toBe(false)
  })

  it('uses ADMIN_SESSION_SECRET when set, independent of the password', () => {
    process.env.ADMIN_SESSION_SECRET = 'a-long-random-secret'
    const token = createAdminSessionToken()
    process.env.ADMIN_PASSWORD = 'rotated'
    expect(verifyAdminSessionToken(token)).toBe(true)
    process.env.ADMIN_SESSION_SECRET = 'a-different-secret'
    expect(verifyAdminSessionToken(token)).toBe(false)
  })

  it('cannot mint or accept anything when admin auth is not configured', () => {
    const token = createAdminSessionToken()
    delete process.env.ADMIN_EMAIL
    delete process.env.ADMIN_PASSWORD
    expect(createAdminSessionToken()).toBeNull()
    expect(verifyAdminSessionToken(token)).toBe(false)
  })
})
