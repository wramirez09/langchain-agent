import { createClient } from '@/utils/server'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'

/**
 * PKCE code-exchange landing route.
 *
 * `@supabase/ssr` issues auth links (password recovery, magic link, invite) in
 * the PKCE flow: the email link verifies with Supabase, which then redirects
 * back to us with `?code=<uuid>`. That code has to be exchanged for a session
 * before any page can act as the user — nothing else in the app does this, so
 * recovery links previously dead-ended. We exchange here, which sets the auth
 * cookies, then forward to `next` (the password form) now that a session exists.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const _next = searchParams.get('next')
  // Only allow same-origin relative paths — never an attacker-supplied absolute URL.
  const next = _next?.startsWith('/') ? _next : '/auth/update-password'

  if (!code) {
    redirect(`/auth/error?error=No code provided`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`)
  }

  redirect(next)
}
