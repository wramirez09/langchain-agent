/**
 * The origin this deployment should send users back to.
 *
 * Replaces a `NODE_ENV === "development" ? localhost : NEXT_PUBLIC_BASE_URL_PROD`
 * ternary that had two defects. `NEXT_PUBLIC_BASE_URL_PROD` was stored without a
 * scheme and *with* a trailing slash ("app.notedoctor.ai/"), so callers
 * prepending `https://` and appending "/path" produced a doubled slash. And
 * preview deployments run with NODE_ENV=production, so they took the production
 * branch — a checkout started on a preview build returned the user to the live
 * site carrying a real session_id.
 *
 * Order matters: an explicit NEXT_PUBLIC_SITE_URL wins, then VERCEL_URL (set
 * per-deployment, so preview builds resolve to themselves), then localhost.
 * Deliberately do NOT set NEXT_PUBLIC_SITE_URL on Preview — that would point
 * previews back at production again.
 */
export function resolveBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return normalize(site);

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return normalize(vercel);

  return "http://localhost:3000";
}

/** Ensure exactly one scheme and no trailing slash, so `${base}/path` is clean. */
function normalize(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, "");
}
