import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { isRedisConfigured } from "@/lib/redis";

/**
 * Diagnostic endpoint. Previously public and leaked env-var names + Stripe key
 * presence (information disclosure). Now gated behind the admin session and
 * returns 404 (not 401) to unauthenticated callers so it isn't discoverable.
 * The env-key enumeration has been removed entirely.
 *
 * Reports booleans only — never a value, prefix, or length of any secret. It
 * answers "is this deployment configured?", which is what you need after
 * setting Vercel env vars, without becoming a config oracle if the admin
 * session ever leaks.
 */
export async function GET() {
  const store = await cookies();
  if (store.get("admin_session")?.value !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Each of these degrades *silently* in production, which is why they're worth
  // surfacing: the API keeps serving traffic either way, just unprotected or
  // unbilled. A green check here is the post-deploy signal that it's real.
  const upstashRedis = isRedisConfigured();
  const stripeMeterEventName = Boolean(process.env.STRIPE_METER_EVENT_NAME);
  const stripeSecretKey = Boolean(process.env.STRIPE_SECRET_KEY);
  // Presence alone isn't enough: a *test* key in production reports healthy
  // while every lookup silently targets the wrong Stripe account — customers
  // exist, webhooks never match, and no subscription is ever provisioned.
  // Only assert the mode where it's knowable; elsewhere presence is the bar.
  const stripeKeyMode =
    process.env.VERCEL_ENV === "production"
      ? Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"))
      : stripeSecretKey;
  const stripeWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const supabaseServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const openaiApiKey = Boolean(process.env.OPENAI_API_KEY);

  const checks = {
    // Without Redis the rate limiter fails OPEN, the API-key cache is bypassed,
    // and Idempotency-Key is ignored.
    upstashRedis,
    // Unset => billable requests are served and logged but never invoiced.
    stripeMeterEventName,
    stripeSecretKey,
    // False when production is running on a test key.
    stripeKeyMode,
    stripeWebhookSecret,
    supabaseServiceRole,
    openaiApiKey,
  };

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    publicApiReady: Object.values(checks).every(Boolean),
    checks,
  });
}
