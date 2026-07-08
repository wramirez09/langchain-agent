import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionOrg, canManage } from "@/lib/api/sessionOrg";
import { generateApiKey } from "@/lib/auth/apiKeys";
import { orgHasApiAccess } from "@/lib/billing/apiAccess";
import { emailsForUserIds } from "@/lib/db/repositories/org.repo";

type KeyRow = { created_by?: string | null; [k: string]: unknown };

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
    .order("created_at", { ascending: false }); // includes revoked keys (shown until deleted)

  if (error) {
    console.error("Failed to list api_keys:", error);
    return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
  }

  const rows = (data ?? []) as KeyRow[];

  // Best-effort: annotate each key with the email of the member who created it,
  // so the dashboard can show "created by …". Never fail the listing over this.
  let creators = new Map<string, string | null>();
  try {
    const ids = [...new Set(rows.map((k) => k.created_by).filter(Boolean) as string[])];
    creators = await emailsForUserIds(ids);
  } catch (e) {
    console.error("Could not resolve key creators:", e);
  }

  const keys = rows.map((k) => ({
    ...k,
    created_by_email: k.created_by ? creators.get(k.created_by) ?? null : null,
  }));

  return NextResponse.json({ keys });
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
  if (!canManage(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await orgHasApiAccess(session.orgId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: "API access is not included in your current plan.", reason: access.reason },
      { status: 402 },
    );
  }

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

  // Annotate the creator email so the dashboard can insert the new row in place
  // (matching the GET listing shape) without a refetch. Best-effort.
  let created_by_email: string | null = null;
  try {
    created_by_email = (await emailsForUserIds([session.userId])).get(session.userId) ?? null;
  } catch (e) {
    console.error("Could not resolve key creator:", e);
  }

  // `key` is shown exactly once — it is not retrievable again.
  return NextResponse.json(
    { key: plaintext, apiKey: { ...data, created_by_email } },
    { status: 201 },
  );
}
