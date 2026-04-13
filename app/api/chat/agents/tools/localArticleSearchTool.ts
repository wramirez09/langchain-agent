import { StructuredTool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareLCA } from "./utils/scoreMedicareDocument";

const CACHE_TTL = 5 * 60 * 1000;

interface StateMetadata {
  data: Array<{
    state_id: number;
    description: string;
  }>;
}

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
    "- state: U.S. state for filtering (optional but recommended)\n" +
    "- maxResults: Number of results (optional, default: 10)\n\n" +
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, score, matchedOn signals, URL, and contractor info.";

  private CMS_LOCAL_ARTICLES_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-articles/";
  private CMS_STATES_API_URL =
    "https://api.coverage.cms.gov/v1/meta/states";

  private stateCache: Map<string, number> = new Map();

  private async resolveStateId(stateName: string): Promise<number | null> {
    const normalized = stateName.toLowerCase().trim();
    
    if (this.stateCache.has(normalized)) {
      return this.stateCache.get(normalized)!;
    }

    try {
      const response = await fetch(this.CMS_STATES_API_URL);
      const statesData: StateMetadata = await response.json();
      
      for (const state of statesData.data) {
        const stateDesc = state.description.toLowerCase();
        this.stateCache.set(stateDesc, state.state_id);
        
        if (stateDesc === normalized || stateDesc.includes(normalized)) {
          return state.state_id;
        }
      }
    } catch (error) {
      console.error("[LocalCoverageArticleSearchTool] Error resolving state ID:", error);
    }
    
    return null;
  }

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);
    const cacheKey = `lca-search:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = await cache.get(cacheKey);

    if (cachedResult) {
      console.log(`[LocalCoverageArticleSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(
      `[LocalCoverageArticleSearchTool] Searching LCAs with input:`,
      JSON.stringify(normalized, null, 2)
    );
    try {
      let stateId: number | null = null;
      
      if (normalized.state) {
        stateId = await this.resolveStateId(normalized.state);
        if (!stateId) {
          return JSON.stringify({
            query: normalized,
            topMatches: [],
            message: `Could not find a valid state ID for '${normalized.state}'. Please provide a valid U.S. state name.`
          });
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const apiUrl = stateId
        ? `${this.CMS_LOCAL_ARTICLES_API_URL}?state_id=${stateId}`
        : this.CMS_LOCAL_ARTICLES_API_URL;

      console.log(`[LocalCoverageArticleSearchTool] Fetching LCAs from: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch local articles: ${response.status} ${response.statusText}`
        );
      }
      const allArticles = await response.json();

      if (!allArticles.data || allArticles.data.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No Local Coverage Articles (LCAs) found${normalized.state ? ` for state: ${normalized.state}` : ''}.`
        });
      }

      const scored = allArticles.data
        .map((lca: any) => {
          const { score, matchedOn } = scoreMedicareLCA(lca, input);
          return { lca, score, matchedOn };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);

      console.log(
        `[LocalCoverageArticleSearchTool] ${scored.length} scored matches for query "${normalized.query}"`
      );

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No Local Coverage Article (LCA) found for '${normalized.query}'${normalized.state ? ` in ${normalized.state}` : ''}.`
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ lca, score, matchedOn }: any) => {
        return {
          id: `${lca.document_id}-${lca.document_version}`,
          title: lca.title || "N/A",
          displayId: lca.document_display_id || undefined,
          score,
          url: lca.url || undefined,
          matchedOn,
          metadata: {
            contractor: lca.contractor_name_type || undefined,
            documentType: lca.document_type || undefined,
            effectiveDate: lca.effective_date || undefined,
            lastUpdated: lca.updated_on || undefined,
            retirementDate: lca.retirement_date || undefined,
          },
        };
      });

      const result = JSON.stringify(
        {
          query: normalized,
          topMatches,
        },
        null,
        2
      );

      console.log(
        `[LocalCoverageArticleSearchTool] Returning ${topMatches.length} results with scores:`,
        topMatches.map(m => ({ title: m.title, score: m.score, matchedOn: m.matchedOn }))
      );

      await cache.set(cacheKey, result, CACHE_TTL);
      return result;
    } catch (error: any) {
      console.error("[LocalCoverageArticleSearchTool] Error in LCA search:", error);
      if (error.name === "AbortError") {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: "Search timed out. Please try again with a more specific query."
        });
      }
      return JSON.stringify({
        query: normalized,
        topMatches: [],
        error: "Error searching for LCA information. Please try again later."
      });
    }
  }
}

// Instantiate and export the tool.
export const localCoverageArticleSearchTool =
  new LocalCoverageArticleSearchTool();
