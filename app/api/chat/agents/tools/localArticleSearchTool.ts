import { StructuredTool } from "@langchain/core/tools";
import { cache, TTL } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareLCA } from "./utils/scoreMedicareDocument";
import { resolveCmsStateId } from "./cmsStateIds";

const CACHE_TTL = 5 * 60 * 1000;

interface LocalCoverageArticle {
  meta: {
    status: {
      id: 0;
      message: string;
    };
    notes: string;
    fields: string[];
    children: string[];
  };
  data: [
    {
      document_id: string;
      document_version: 0;
      document_display_id: string;
      document_type: string;
      note: string;
      title: string;
      contractor_name_type: string;
      updated_on: string;
      updated_on_sort: string;
      effective_date: string;
      retirement_date: string;
      url: string;
    },
  ];
}

class LocalCoverageArticleSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
  name = "local_coverage_article_search";
  schema = MedicareSearchInputSchema;
  description =
    "Searches Local Coverage Articles (LCAs) for Medicare billing and coding guidance specific to a state. " +
    "LCAs provide detailed billing, coding (ICD-10/CPT), and documentation requirements that support LCDs. " +
    "Uses deterministic scoring to rank LCAs by relevance. " +
    "Returns structured JSON with topMatches containing scored results.\n\n" +
    "**Input fields:**\n" +
    "- query: Main search query (required) - treatment, diagnosis, or article topic\n" +
    "- treatment: Specific treatment name (optional)\n" +
    "- diagnosis: Diagnosis description (optional)\n" +
    "- cpt: CPT/HCPCS  (optional)\n" +
    "- icd10: ICD-10 code(s) (optional)\n" +
    "- state: U.S. state (REQUIRED — LCAs are scoped to MAC regions; the tool returns an empty result if state is missing)\n" +
    "- maxResults: Number of results (optional, default: 10)\n\n" +
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, displayId, documentId, documentVersion, score, matchedOn signals, URL, and contractor info.\n\n" +
    "**Next step:** For full policy content, call `medicare_policy_detail` with " +
    "`{ documentType: \"article\", documentId, documentVersion }` from a top match. " +
    "Do NOT call `policy_content_extractor` for cms.gov/medicare.gov URLs.";

  private CMS_LOCAL_ARTICLES_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-articles/";

  private resolveStateId(stateName: string): number | null {
    return resolveCmsStateId(stateName);
  }

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);
    const cacheKey = `lca-search:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`[LocalCoverageArticleSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(`[LocalCoverageArticleSearchTool] Searching LCAs:`, JSON.stringify(normalized));

    // LCAs are state-scoped (MAC-region-scoped) like LCDs. Without a state,
    // the tool fetches the full nationwide dataset (~2150 records, ~1MB,
    // 14s cold) and scoring is noisy. Require state explicitly.
    if (!normalized.state) {
      return JSON.stringify({
        query: normalized,
        topMatches: [],
        message:
          "Local Coverage Article search requires a U.S. state. Ask the user which state the patient is in (or which MAC region the provider bills under), then call this tool again with the `state` field set.",
      });
    }

    try {
      const toolStart = Date.now();
      let stateId: number | null = null;

      {
        stateId = this.resolveStateId(normalized.state);
        if (!stateId) {
          console.warn(`[LocalCoverageArticleSearchTool] No state_id found for: "${normalized.state}"`);
          return JSON.stringify({
            query: normalized,
            topMatches: [],
            message: `Could not find a valid state ID for '${normalized.state}'. Please provide a valid U.S. state name.`,
          });
        }
        console.log(`[LocalCoverageArticleSearchTool] State ID resolved: "${normalized.state}" → ${stateId}`);
      }

      const apiUrl = stateId
        ? `${this.CMS_LOCAL_ARTICLES_API_URL}?state_id=${stateId}`
        : this.CMS_LOCAL_ARTICLES_API_URL;
      const rawCacheKey = `cms-lca-raw-data:${stateId ?? "all"}`;

      let allArticles: any = cache.get(rawCacheKey);
      if (allArticles) {
        console.log(`[LocalCoverageArticleSearchTool] Raw data cache hit (${allArticles.data?.length ?? 0} records)`);
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        console.log(`[LocalCoverageArticleSearchTool] Fetching LCAs from CMS API (state_id=${stateId ?? "all"})...`);
        const fetchStart = Date.now();
        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeout);
        console.log(`[LocalCoverageArticleSearchTool] CMS fetch: ${Date.now() - fetchStart}ms`);

        if (!response.ok) throw new Error(`Failed to fetch LCAs: ${response.status} ${response.statusText}`);

        const parseStart = Date.now();
        allArticles = await response.json();
        const rawSize = JSON.stringify(allArticles).length;
        console.log(`[LocalCoverageArticleSearchTool] JSON parse: ${Date.now() - parseStart}ms, ${allArticles?.data?.length ?? 0} records, ${(rawSize / 1024).toFixed(1)}KB`);
        cache.set(rawCacheKey, allArticles, TTL.LONG);
      }

      if (!Array.isArray(allArticles?.data)) {
        console.error("[LocalCoverageArticleSearchTool] Unexpected response shape", allArticles);
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: "Unexpected CMS API response format. Please try again later."
        });
      }

      if (allArticles.data.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No LCAs found${normalized.state ? ` for state: ${normalized.state}` : ""}.`,
        });
      }

      const scoreStart = Date.now();
      const scored = allArticles.data
        .map((lca: any) => { const { score, matchedOn } = scoreMedicareLCA(lca, input); return { lca, score, matchedOn }; })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      console.log(`[LocalCoverageArticleSearchTool] Scored ${allArticles.data.length} records: ${Date.now() - scoreStart}ms → ${scored.length} matches`);

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No LCA found for '${normalized.query}'${normalized.state ? ` in ${normalized.state}` : ""}.`,
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ lca, score, matchedOn }: any) => ({
        id: `${lca.document_id}-${lca.document_version}`,
        title: lca.title || "N/A",
        displayId: lca.document_display_id || undefined,
        documentId: lca.document_id != null ? String(lca.document_id) : undefined,
        documentVersion: typeof lca.document_version === "number"
          ? lca.document_version
          : lca.document_version != null ? Number(lca.document_version) : undefined,
        score,
        url: lca.url || undefined,
        matchedOn,
        metadata: {
          contractor: lca.contractor_name_type || undefined,
          documentType: lca.document_type || undefined,
        },
      }));

      const result = JSON.stringify({ query: normalized, topMatches }, null, 2);
      cache.set(cacheKey, result, TTL.LONG);
      console.log(`[LocalCoverageArticleSearchTool] Output to LLM: ${result.length} chars (~${(result.length / 1024).toFixed(1)}KB) for ${topMatches.length} matches, total: ${Date.now() - toolStart}ms`);
      return result;
    } catch (error: any) {
      console.error("[LocalCoverageArticleSearchTool] Error:", error.message);
      if (error.name === "AbortError") {
        return JSON.stringify({ query: normalized, topMatches: [], error: "Search timed out. Please try again with a more specific query." });
      }
      return JSON.stringify({ query: normalized, topMatches: [], error: "Error searching LCA information. Please try again later." });
    }
  }
}

export const localCoverageArticleSearchTool = new LocalCoverageArticleSearchTool();
