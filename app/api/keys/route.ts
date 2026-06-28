import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionOrg } from "@/lib/api/sessionOrg";
import { generateApiKey } from "@/lib/auth/apiKeys";

export const dynamic = "force-dynamic";

// Columns safe to return in a listing — never the hash or full key.
const LIST_COLUMNS =
  "id, name, key_prefix, environment, scopes, rate_limit_tier, created_at, last_used_at, revoked_at, expires_at, created_by";

const CreateKeySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  environment: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.enum(["agents", "chat"])).min(1).default(["agents", "chat"]),
  expiresAt: z.string().datetime().optional(),
});

/** GET /api/keys — list the caller's org's keys (prefixes + metadata only). */
export async function GET() {
  let session;
  try {
    session = await getSessionOrg();
  } catch {
    return NextResponse.json({ error: "No organization for user" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select(LIST_COLUMNS)
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to list api_keys:", error);
    return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
  }

  return NextResponse.json({ keys: data ?? [] });
}

/** POST /api/keys — mint a key for the caller's org. Returns plaintext ONCE. */
export async function POST(req: Request) {
  let session;
  try {
    session = await getSessionOrg();
  } catch {
    return NextResponse.json({ error: "No organization for user" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    // empty body is allowed — defaults apply
  }

  const parsed = CreateKeySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { name, environment, scopes, expiresAt } = parsed.data;

  const { plaintext, hash, prefix } = generateApiKey(environment);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert({
      org_id: session.orgId,
      created_by: session.userId,
      key_hash: hash,
      key_prefix: prefix,
      name: name ?? null,
      environment,
      scopes,
      expires_at: expiresAt ?? null,
    })
    .select(LIST_COLUMNS)
    .single();

  if (error) {
    console.error("Failed to create api_key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }

  // `key` is shown exactly once — it is not retrievable again.
  return NextResponse.json({ key: plaintext, apiKey: data }, { status: 201 });
}
