import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrg } from "@/lib/api/requireOrg";
import { userHasApiAccess } from "@/lib/billing/apiAccess";
import { generateApiKey } from "@/lib/auth/apiKeys";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The agent self-call can run 45-65s; match the public agent route's ceiling.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Server-side test harness for the public API.
 *
 * The public API is authenticated by a secret `sk_` key that must never reach a
 * browser, so the in-dashboard playground cannot call `/api/v1/*` directly.
 * Instead it posts here (cookie-session authed, subscriber-gated), and THIS
 * route exercises the real endpoint on the user's behalf:
 *
 *   mint an ephemeral TEST key → call /api/v1/<endpoint> with it, same-origin
 *   and server-side (no CORS, key never leaves the server) → capture the exact
 *   status/headers/body → delete the key.
 *
 * Because it hits the real HTTP surface, the response reflects the genuine
 * Bearer-auth, rate-limit, and idempotency behavior — not a shortcut through
 * the handlers. Every request is attributed to the calling user (the ephemeral
 * key's `created_by`), so playground usage meters to them, same as a real key.
 */

const ENDPOINTS = {
  me: { method: "GET" as const, path: "/api/v1/me" },
  usage: { method: "GET" as const, path: "/api/v1/usage" },
  chat: { method: "POST" as const, path: "/api/v1/chat" },
  agents: { method: "POST" as const, path: "/api/v1/agents" },
};

const BodySchema = z.object({
  endpoint: z.enum(["me", "usage", "chat", "agents"]),
  // Forwarded verbatim to the POST endpoints; ignored for GETs. Validation is
  // the public route's job — we deliberately relay whatever the user typed so
  // they see the API's own 400s.
  payload: z.unknown().optional(),
  idempotencyKey: z.string().max(255).optional(),
});

/** Headers worth surfacing in the playground; everything else is noise. */
const SURFACED_HEADERS = [
  "content-type",
  "cache-control",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
  "idempotency-replayed",
  "x-thread-id",
];

/** Build the deployment's own origin from the incoming request. */
function selfOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

export async function POST(req: Request) {
  const s = await requireOrg();
  if (s instanceof Response) return s;

  // Subscriber-only. This mirrors the gate the real endpoints enforce, and
  // fails fast before minting anything.
  const access = await userHasApiAccess(s.userId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: "The API playground requires an active subscription.", reason: access.reason },
      { status: 402 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { endpoint, payload, idempotencyKey } = parsed.data;
  const spec = ENDPOINTS[endpoint];

  const origin = selfOrigin(req);
  if (!origin) {
    return NextResponse.json({ error: "Could not resolve API origin" }, { status: 500 });
  }

  // Mint an ephemeral TEST key. `expires_at` is a safety net: even if the
  // delete below never runs (crash/timeout), the key self-expires in minutes,
  // so a leak can't authenticate for long.
  const { plaintext, hash, prefix } = generateApiKey("test");
  const { data: keyRow, error: mintError } = await supabaseAdmin
    .from("api_keys")
    .insert({
      org_id: s.orgId,
      created_by: s.userId,
      key_hash: hash,
      key_prefix: prefix,
      name: "playground (ephemeral)",
      environment: "test",
      scopes: ["agents", "chat"],
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (mintError || !keyRow) {
    return NextResponse.json({ error: "Could not start a test session" }, { status: 500 });
  }
  const keyId = keyRow.id as string;

  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${plaintext}`,
      "content-type": "application/json",
    };
    if (idempotencyKey && spec.method === "POST") {
      headers["idempotency-key"] = idempotencyKey;
    }
    // Non-streaming only: the playground renders a single JSON response, so we
    // never pass `stream: true`. Merge the user's payload but pin stream off.
    const body =
      spec.method === "POST"
        ? JSON.stringify({ ...(payload as object | undefined), stream: false })
        : undefined;

    const started = Date.now();
    const upstream = await fetch(`${origin}${spec.path}`, {
      method: spec.method,
      headers,
      body,
    });
    const durationMs = Date.now() - started;

    const surfaced: Record<string, string> = {};
    for (const h of SURFACED_HEADERS) {
      const v = upstream.headers.get(h);
      if (v !== null) surfaced[h] = v;
    }

    // Parse JSON when we can; fall back to raw text (e.g. a streamed reply if a
    // caller ever forces one, or an upstream error page).
    const raw = await upstream.text();
    let parsedBody: unknown = raw;
    try {
      parsedBody = raw ? JSON.parse(raw) : null;
    } catch {
      /* keep raw text */
    }

    return NextResponse.json({
      request: {
        method: spec.method,
        path: spec.path,
        // Echo the shape sent — never the Authorization value.
        headers: {
          Authorization: "Bearer sk_test_… (server-held, per-request)",
          "Content-Type": "application/json",
          ...(idempotencyKey && spec.method === "POST"
            ? { "Idempotency-Key": idempotencyKey }
            : {}),
        },
        body: spec.method === "POST" ? { ...(payload as object | undefined), stream: false } : null,
      },
      response: {
        status: upstream.status,
        durationMs,
        headers: surfaced,
        body: parsedBody,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The test request could not be completed." },
      { status: 502 },
    );
  } finally {
    // Best-effort teardown; the expires_at safety net covers any miss.
    await supabaseAdmin.from("api_keys").delete().eq("id", keyId);
  }
}
