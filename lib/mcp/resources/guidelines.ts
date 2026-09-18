import {
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/server";

import { cache, TTL } from "@/lib/cache";

import type { McpCallContext } from "../context";
import { truncateForClient } from "../limits";
import { resourcesEnabled } from "../policy";

/**
 * Guideline resources: `search → corpusId → read the full document`.
 *
 * The URI is `notedoctor://guideline/{corpusId}`, where `corpusId` is the
 * `commercial_guidelines.id` that search results already carry. That identity
 * is the whole affordance, and the alternatives were both wrong:
 * path-shaped URIs (`…/cardio/afib.md`) would leak the folder and file names
 * `redactResult` exists to strip, and `generateDocId` is
 * `md5(absolutePath).slice(0,12)`, so it depends on `process.cwd()` and is not
 * stable between a laptop and Vercel.
 *
 * Bodies come from Postgres, never from disk: the ids line up with search
 * results one-to-one, and `loadDocumentContent`'s dynamic `fs.readFileSync`
 * under `process.cwd()` is invisible to Next's static file tracing, so the
 * corpus files are not guaranteed to be bundled at all.
 *
 * Gated behind `MCP_EXPOSE_GUIDELINE_RESOURCES` and default off — see
 * `resourcesEnabled`.
 */

const LIST_CACHE_KEY = "mcp-guideline-index:v1";

type GuidelineRow = { id: string; title: string; domain: string | null };

async function guidelineIndex(): Promise<GuidelineRow[]> {
  const hit = cache.get<GuidelineRow[]>(LIST_CACHE_KEY);
  if (hit) return hit;

  // Lazy: `lib/supabaseAdmin` throws at import time without a service-role
  // key, and this module is reachable from `buildMcpServer`, which every
  // request builds. A missing key must degrade this one resource, not take
  // down `initialize` for the whole surface.
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  const { data, error } = await supabaseAdmin
    .from("commercial_guidelines")
    .select("id, title, domain")
    .order("id");

  if (error) {
    console.warn("[MCP] guideline index fetch failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as GuidelineRow[];
  // The corpus changes only on re-ingest, so it caches for a long time.
  cache.set(LIST_CACHE_KEY, rows, TTL.VERY_LONG);
  return rows;
}

export function registerGuidelineResources(server: McpServer, ctx: McpCallContext): void {
  if (!resourcesEnabled()) return;

  /**
   * A tiny static resource so a client can orient itself — counts and domains
   * — without paging through the whole index first.
   */
  server.registerResource(
    "corpus-manifest",
    "notedoctor://corpus/manifest",
    {
      title: "Commercial guideline corpus manifest",
      description: "How many commercial-payer guideline documents exist, and which domains they cover.",
      mimeType: "application/json",
    },
    async (uri) => {
      const rows = await guidelineIndex();
      const domains = [...new Set(rows.map((r) => r.domain).filter(Boolean))].sort();
      ctx.meter("mcp_resource");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ count: rows.length, domains }),
          },
        ],
      };
    },
  );

  server.registerResource(
    "guideline",
    new ResourceTemplate("notedoctor://guideline/{corpusId}", {
      list: async () => {
        const rows = await guidelineIndex();
        return {
          resources: rows.map((r) => ({
            uri: `notedoctor://guideline/${r.id}`,
            name: r.id,
            title: r.title,
            mimeType: "text/markdown",
            ...(r.domain ? { description: `Domain: ${r.domain}` } : {}),
          })),
        };
      },
    }),
    {
      title: "Commercial payer guideline",
      description:
        "The full text of one commercial-payer prior authorization guideline. Take `corpusId` from a `commercial_guidelines_search` result.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const raw = variables.corpusId;
      const corpusId = Array.isArray(raw) ? raw[0] : raw;

      // An unknown id is a protocol-level error, not a tool error, and it must
      // never fall through to a filesystem read.
      if (typeof corpusId !== "string" || !corpusId) {
        throw new ResourceNotFoundError(uri.href, "Malformed guideline URI.");
      }

      const { fetchCommercialBodies } = await import("@/lib/priorAuth/review/sourceBodies");
      const bodies = await fetchCommercialBodies([corpusId]);
      const body = bodies.get(corpusId);
      if (!body) {
        throw new ResourceNotFoundError(uri.href, `No guideline with id "${corpusId}".`);
      }

      ctx.meter("mcp_resource");
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: truncateForClient(body) }],
      };
    },
  );
}
