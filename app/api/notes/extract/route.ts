import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest";
import { detectPhi, blockingFindings, residueSummary } from "@/lib/phi/detect";
import { extractQueryFields } from "@/lib/noteIngest/extractFields";
import { serializeQuery } from "@/lib/priorAuth/serializeQuery";
import { reportUsage } from "@/lib/usage";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * De-identified clinical note -> a prior-auth query string.
 *
 * The important thing about this route is what it must NEVER do: log its
 * request body, echo it in an error, or persist it. The body is text a
 * clinician pulled out of a chart. It has been through `lib/phi` in the
 * browser, but redaction is best-effort, so the working assumption here is
 * that a residual identifier may have survived -- which is exactly why the
 * tripwire runs before anything else and why nothing below ever interpolates
 * `body.text` into a string.
 *
 * `documents/privacy-policy.md` disclaims Business Associate status, so the
 * de-identification that lets this request exist happened client-side. This
 * endpoint is the second line, not the first: it catches a stale client
 * bundle or a direct API caller, and it fails loudly rather than quietly
 * forwarding PHI to OpenAI.
 */

export const maxDuration = 60;

/**
 * Comfortably under the 100k `MAX_MESSAGE_CHARS` ceiling in
 * `app/api/chat/agents/route.ts`, so a note that passes here cannot produce a
 * query the screening endpoint then rejects.
 */
const MAX_NOTE_CHARS = 50_000;

const BodySchema = z.object({
  text: z.string().min(1).max(MAX_NOTE_CHARS),
  sourceKind: z
    .enum(["txt", "md", "paste", "pdf", "docx", "image"])
    .optional()
    .default("paste"),
  /**
   * How many identifiers the browser removed. Used only to build the human
   * receipt, never to decide anything -- the tripwire below re-derives trust
   * from the text itself rather than believing the client.
   */
  redactionCount: z.number().int().min(0).max(10_000).optional().default(0),
});

const SOURCE_LABEL: Record<string, string> = {
  txt: "an uploaded note",
  md: "an uploaded note",
  paste: "pasted text",
  pdf: "an uploaded PDF",
  docx: "an uploaded document",
  image: "an uploaded image",
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Cost guard. The screening itself is capped separately in the chat route. */
const RATE_LIMIT_PER_DAY = Number(
  process.env.NOTE_EXTRACT_RATE_LIMIT_PER_DAY ?? 200,
);

export async function POST(req: NextRequest) {
  let userId: string | undefined;

  try {
    const user = await getUserFromRequest(req);
    userId = user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        { status: 401, headers: NO_STORE },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    // Field paths only. `parsed.error.flatten()` would be safe today, but it
    // can carry received values for some issue types, and the received value
    // here is the note.
    return NextResponse.json(
      {
        error: "INVALID_REQUEST_BODY",
        fields: parsed.error.issues.map((i) => i.path.join(".")),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const body = parsed.data;

  /* ---------- TRIPWIRE ---------- */
  const findings = detectPhi(body.text);
  const blocking = blockingFindings(findings);
  if (blocking.length > 0) {
    // Counts only. Naming what was found would copy the identifier into a
    // response body and, from there, into whatever logs it.
    console.warn(
      `[notes/extract] PHI tripwire blocked a request for ${userId}:`,
      JSON.stringify(residueSummary(blocking)),
    );
    return NextResponse.json(
      { error: "PHI_DETECTED", categories: residueSummary(blocking) },
      { status: 422, headers: NO_STORE },
    );
  }

  /* ---------- RATE LIMIT ---------- */
  if (RATE_LIMIT_PER_DAY > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("usage_type", "note_extract")
      .gte("created_at", since);
    if (error) {
      // Fail open, as the agents route does: a database hiccup must not lock a
      // clinician out of a healthcare workflow.
      console.error(`[notes/extract] Rate-limit query failed for ${userId}`);
    } else if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED" },
        { status: 429, headers: { ...NO_STORE, "Retry-After": "3600" } },
      );
    }
  }

  /* ---------- EXTRACT ---------- */
  let result: Awaited<ReturnType<typeof extractQueryFields>>;
  try {
    result = await extractQueryFields(body.text);
  } catch {
    return NextResponse.json(
      { error: "EXTRACTION_FAILED" },
      { status: 502, headers: NO_STORE },
    );
  }

  const noun = body.redactionCount === 1 ? "identifier" : "identifiers";
  const receipt = `${body.redactionCount} ${noun} removed from ${
    SOURCE_LABEL[body.sourceKind] ?? "an uploaded note"
  }`;

  // Emptiness has to be judged on the FIELDS, not on the serialized string:
  // the receipt is always appended, so the query is never empty. Without this
  // a note nothing could be read out of would still fire -- and bill -- a
  // screening run whose entire input was "0 identifiers removed".
  const hasContent = Object.values(result.fields).some((v) => v.trim());
  if (!hasContent) {
    return NextResponse.json(
      { error: "NO_FIELDS_EXTRACTED" },
      { status: 422, headers: NO_STORE },
    );
  }

  const query = serializeQuery(result.fields, { deidentification: receipt });

  // Metered separately from the screening `runAgent` will report. One click
  // therefore bills two units, which is the intended accounting.
  void reportUsage({
    userId,
    source: "web",
    usageType: "note_extract",
    quantity: 1,
  }).catch(() => {});

  return NextResponse.json(
    {
      query,
      fields: result.fields,
      usedModel: result.usedModel,
      residue: residueSummary(findings),
    },
    { status: 200, headers: NO_STORE },
  );
}
