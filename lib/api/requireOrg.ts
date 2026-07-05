import { NextResponse } from "next/server";
import { getSessionOrg, type SessionOrg } from "@/lib/api/sessionOrg";

/**
 * Resolve the session org for a dashboard route, or return the appropriate
 * error Response. Usage:
 *   const s = await requireOrg();
 *   if (s instanceof Response) return s;
 *   // s is SessionOrg
 */
export async function requireOrg(): Promise<SessionOrg | Response> {
  let session: SessionOrg | null;
  try {
    session = await getSessionOrg();
  } catch {
    return NextResponse.json({ error: "No organization for user" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}
