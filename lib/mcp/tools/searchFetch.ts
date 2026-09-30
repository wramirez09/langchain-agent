import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toolError } from "../adapt";
import type { McpCallContext } from "../context";
import { truncateForClient } from "../limits";
import { canUse, resourcesEnabled } from "../policy";

/**
 * `search` and `fetch` — the two-tool contract ChatGPT requires before it will
 * use a connector in deep research and company knowledge. Claude ignores the
 * names and treats them as ordinary tools.
 *
 * They are thin projections over the retrieval tools, not new retrieval:
 * `search` fans a free-text query out to national Medicare coverage (NCD —
 * LCDs need a state this contract has no slot for) and the commercial
 * guideline corpus; `fetch` resolves one of the ids it returned. Ids carry
 * their source as a prefix so `fetch` never has to guess:
 *
 *   ncd:<documentId>:<version>   lcd:<…>:<…>   article:<…>:<…>   guideline:<corpusId>
 *
 * Guideline bodies are the thing `MCP_EXPOSE_GUIDELINE_RESOURCES` guards, and
 * `fetch` is as bulk-readable as a resource. So without that flag `fetch`
 * returns the guideline's metadata and a bounded excerpt — what search already
 * surfaces — never the full body.
 */

export const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "What to look for: a procedure, diagnosis, CPT/ICD-10 code or payer policy question.",
    ),
});

export const FetchInputSchema = z.object({
  id: z.string().min(1).describe("An id returned by `search`."),
});

export type SearchResult = { id: string; title: string; url?: string };

type MedicareType = "ncd" | "lcd" | "article";

export type ParsedDocId =
  | {
      kind: "medicare";
      documentType: MedicareType;
      documentId: string;
      documentVersion: number;
    }
  | { kind: "guideline"; corpusId: string };

const CMS_VIEW = "https://www.cms.gov/medicare-coverage-database/view";
const GUIDELINE_EXCERPT_CHARS = 2_000;
const MAX_SEARCH_RESULTS = 10;

/** Parse a `search` id. Returns null for anything this surface did not mint. */
export function parseDocId(id: string): ParsedDocId | null {
  const medicare = /^(ncd|lcd|article):([A-Za-z0-9.-]{1,32}):(\d{1,6})$/.exec(
    id,
  );
  if (medicare) {
    return {
      kind: "medicare",
      documentType: medicare[1] as MedicareType,
      documentId: medicare[2],
      documentVersion: Number(medicare[3]),
    };
  }
  const guideline = /^guideline:([A-Za-z0-9._/-]{1,200})$/.exec(id);
  if (guideline) return { kind: "guideline", corpusId: guideline[1] };
  return null;
}

/** The public Medicare Coverage Database page for one document version. */
export function medicareUrl(
  type: MedicareType,
  documentId: string,
  version: number,
): string {
  const id = encodeURIComponent(documentId);
  if (type === "ncd")
    return `${CMS_VIEW}/ncd.aspx?ncdid=${id}&ncdver=${version}`;
  if (type === "lcd") return `${CMS_VIEW}/lcd.aspx?lcdid=${id}&ver=${version}`;
  return `${CMS_VIEW}/article.aspx?articleid=${id}&ver=${version}`;
}

type Match = {
  id?: unknown;
  title?: unknown;
  documentId?: unknown;
  documentVersion?: unknown;
  url?: unknown;
};

function topMatches(raw: unknown): Match[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as { topMatches?: unknown };
    return Array.isArray(parsed.topMatches)
      ? (parsed.topMatches as Match[])
      : [];
  } catch {
    return [];
  }
}

/**
 * Merge NCD and guideline matches into one list, interleaved so neither
 * source crowds the other out of the first page.
 */
export function toSearchResults(
  ncdRaw: unknown,
  guidelineRaw: unknown,
): SearchResult[] {
  const ncd: SearchResult[] = topMatches(ncdRaw).flatMap((m) => {
    if (m.documentId == null || typeof m.documentVersion !== "number")
      return [];
    const documentId = String(m.documentId);
    return [
      {
        id: `ncd:${documentId}:${m.documentVersion}`,
        title:
          typeof m.title === "string" && m.title
            ? m.title
            : `NCD ${documentId}`,
        url: medicareUrl("ncd", documentId, m.documentVersion),
      },
    ];
  });
  // No public page exists for a corpus guideline, so it carries no url rather
  // than one that would not open.
  const guidelines: SearchResult[] = topMatches(guidelineRaw).flatMap((m) =>
    typeof m.id === "string" && m.id
      ? [
          {
            id: `guideline:${m.id}`,
            title: typeof m.title === "string" ? m.title : m.id,
          },
        ]
      : [],
  );

  const out: SearchResult[] = [];
  for (
    let i = 0;
    out.length < MAX_SEARCH_RESULTS &&
    (i < ncd.length || i < guidelines.length);
    i++
  ) {
    if (i < ncd.length) out.push(ncd[i]);
    if (i < guidelines.length && out.length < MAX_SEARCH_RESULTS)
      out.push(guidelines[i]);
  }
  return out;
}

/** ChatGPT reads `structuredContent`; older clients read the text. Send both. */
function jsonResult(value: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

async function runSearch(
  query: string,
  ctx: McpCallContext,
): Promise<CallToolResult> {
  const settle = async (run: () => Promise<unknown>) => {
    try {
      return await run();
    } catch (e) {
      console.warn("[MCP] search source failed:", (e as Error).message);
      return null;
    }
  };

  const [ncdRaw, guidelineRaw] = await Promise.all([
    settle(async () => {
      const mod =
        await import("@/app/api/chat/agents/tools/NCDCoverageSearchTool");
      return new mod.NCDCoverageSearchTool().invoke({ query, maxResults: 5 });
    }),
    settle(async () => {
      const mod =
        await import("@/app/api/chat/agents/tools/CommercialGuidelineSearchTool");
      return mod
        .createCommercialGuidelineSearchTool()
        .invoke({ query, maxResults: 5 });
    }),
  ]);

  if (ncdRaw == null && guidelineRaw == null) {
    return toolError("Search is unavailable right now. Try again shortly.");
  }

  ctx.meter("mcp_tool");
  return jsonResult({ results: toSearchResults(ncdRaw, guidelineRaw) });
}

async function fetchMedicare(
  doc: Extract<ParsedDocId, { kind: "medicare" }>,
  id: string,
  ctx: McpCallContext,
): Promise<CallToolResult> {
  const { medicarePolicyDetailTool } =
    await import("@/app/api/chat/agents/tools/medicarePolicyDetailTool");
  const raw = String(
    await medicarePolicyDetailTool.invoke({
      documentType: doc.documentType,
      documentId: doc.documentId,
      documentVersion: doc.documentVersion,
    }),
  );

  let detail: Record<string, unknown>;
  try {
    detail = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return toolError("The CMS coverage API returned an unreadable document.");
  }
  if (typeof detail.error === "string")
    return toolError(`CMS coverage API: ${detail.error}`);

  ctx.meter("mcp_tool");
  const label =
    doc.documentType === "article" ? "Article" : doc.documentType.toUpperCase();
  return jsonResult({
    id,
    title:
      typeof detail.title === "string"
        ? detail.title
        : `${label} ${doc.documentId}`,
    text: truncateForClient(raw),
    url: medicareUrl(doc.documentType, doc.documentId, doc.documentVersion),
    metadata: {
      source: "cms",
      documentType: doc.documentType,
      documentVersion: doc.documentVersion,
    },
  });
}

async function fetchGuideline(
  corpusId: string,
  id: string,
  ctx: McpCallContext,
): Promise<CallToolResult> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("commercial_guidelines")
    .select("id, title, domain, treatment, procedures, cpt_codes, body")
    .eq("id", corpusId)
    .maybeSingle();

  if (error)
    return toolError(
      "The guideline corpus is unavailable right now. Try again shortly.",
    );
  if (!data)
    return toolError(
      `No document with id "${id}". Use an id returned by \`search\`.`,
    );

  const body = String(data.body ?? "");
  let text: string;
  if (resourcesEnabled()) {
    text = truncateForClient(body);
  } else {
    const { selectRelevantExcerpt } =
      await import("@/app/api/chat/agents/tools/utils/excerpt");
    text = selectRelevantExcerpt(
      body,
      String(data.title ?? ""),
      GUIDELINE_EXCERPT_CHARS,
    );
  }

  ctx.meter("mcp_tool");
  return jsonResult({
    id,
    title: data.title,
    text,
    metadata: {
      source: "commercial_guideline",
      domain: data.domain ?? null,
      treatment: data.treatment ?? null,
      procedures: data.procedures ?? [],
      cptCodes: data.cpt_codes ?? [],
      excerptOnly: !resourcesEnabled(),
    },
  });
}

export function registerSearchFetchTools(
  server: McpServer,
  ctx: McpCallContext,
): void {
  if (canUse(ctx.auth, "search")) {
    server.registerTool(
      "search",
      {
        title: "Search coverage policy",
        description:
          "Search Medicare national coverage determinations and NoteDoctorAi's commercial-payer prior authorization guidelines. Returns ids to pass to `fetch`. For state-specific Medicare (LCD) coverage use `medicare_multi_search` with a state. Send clinical details only — no patient identifiers.",
        inputSchema: SearchInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ query }) => runSearch(query, ctx),
    );
  }

  if (canUse(ctx.auth, "fetch")) {
    server.registerTool(
      "fetch",
      {
        title: "Fetch coverage document",
        description:
          "Fetch one document by an id returned by `search`: the full structured Medicare policy from the CMS coverage API, or a commercial guideline's criteria summary.",
        inputSchema: FetchInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ id }) => {
        const doc = parseDocId(id);
        if (!doc)
          return toolError(
            `Unknown id "${id}". Use an id returned by \`search\`.`,
          );
        try {
          return doc.kind === "medicare"
            ? await fetchMedicare(doc, id, ctx)
            : await fetchGuideline(doc.corpusId, id, ctx);
        } catch (e) {
          return toolError(`The fetch failed: ${(e as Error).message}`);
        }
      },
    );
  }
}
