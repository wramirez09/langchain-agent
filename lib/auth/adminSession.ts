import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Admin session cookie.
 *
 * The cookie used to hold the literal string "1", and every admin page and
 * route checked `value === '1'`. Nothing tied that value to a login, so anyone
 * could set `admin_session=1` in their own browser and reach the dashboard,
 * the debug endpoint, and the Stripe usage write/reverse routes.
 *
 * The cookie now carries a signed, expiring token:
 *
 *   v1.<expiresAtUnixSeconds>.<randomNonce>.<HMAC-SHA256 of the first three parts>
 *
 * Only the server can mint one, because the HMAC key is derived from secrets
 * that never leave it. Verification is stateless, so it needs no table and
 * keeps working when Redis is down.
 *
 * Key: `ADMIN_SESSION_SECRET` when set; otherwise derived from `ADMIN_EMAIL`
 * and `ADMIN_PASSWORD`, so deploying this needs no new env var, and rotating
 * the admin password signs every existing session out. With none of them set,
 * no token can be minted or accepted.
 */

export const ADMIN_SESSION_COOKIE = 'admin_session'

/** How long an admin login lasts. */
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60

const VERSION = 'v1'

function signingKey(): Buffer | null {
  const explicit = process.env.ADMIN_SESSION_SECRET
  if (explicit) {
    return createHash('sha256').update(`admin-session:${VERSION}:secret:${explicit}`).digest()
  }
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return null
  return createHash('sha256')
    .update(`admin-session:${VERSION}:creds:${email}\n${password}`)
    .digest()
}

function sign(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

/** Mint a session token. Returns null when admin auth is not configured. */
export function createAdminSessionToken(nowMs: number = Date.now()): string | null {
  const key = signingKey()
  if (!key) return null
  const expiresAt = Math.floor(nowMs / 1000) + ADMIN_SESSION_TTL_SECONDS
  const nonce = randomBytes(16).toString('base64url')
  const payload = `${VERSION}.${expiresAt}.${nonce}`
  return `${payload}.${sign(key, payload)}`
}

/** True only for an unexpired token this server signed. */
export function verifyAdminSessionToken(
  token: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!token) return false
  const key = signingKey()
  if (!key) return false

  const parts = token.split('.')
  if (parts.length !== 4) return false
  const [version, expiresAt, nonce, signature] = parts
  if (version !== VERSION || !/^\d{1,12}$/.test(expiresAt) || !nonce || !signature) return false

  const expected = Buffer.from(sign(key, `${version}.${expiresAt}.${nonce}`))
  const actual = Buffer.from(signature)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false

  return Number(expiresAt) * 1000 > nowMs
}

type CookieReader = { get(name: string): { value: string } | undefined }

/** Whether the request's cookies carry a valid admin session. */
export function hasAdminSession(cookieStore: CookieReader): boolean {
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
}
