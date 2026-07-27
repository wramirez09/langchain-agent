import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Diagnostic endpoint. Previously public and leaked env-var names + Stripe key
 * presence (information disclosure). Now gated behind the admin session and
 * returns 404 (not 401) to unauthenticated callers so it isn't discoverable.
 * The env-key enumeration has been removed entirely — it returns booleans only,
 * never a value, prefix, or the name of any variable that isn't checked here.
 */
export async function GET() {
  const store = await cookies();
  if (store.get("admin_session")?.value !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    stripeKeyDefined: !!process.env.STRIPE_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
