/**
 * Resolve a post-login `next` parameter to a same-origin path, or `fallback`.
 *
 * Only a path that starts with a single `/` is accepted. `//evil.com` and
 * `/\evil.com` are protocol-relative to a browser (it normalises `\` to `/`),
 * so both are rejected along with anything absolute. This is the one open
 * redirect check in the app; the login form, the PKCE callback and the OAuth
 * consent page all route through it.
 */
export function safeNext(
  next: string | null | undefined,
  fallback: string,
): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Control characters (tab, newline) are stripped by URL parsers and can turn
  // `/\t/evil.com` into `//evil.com` after the check has passed.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
