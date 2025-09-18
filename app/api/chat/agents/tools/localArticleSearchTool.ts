import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { LocalLcdSearchInputSchema } from "./localLcdSearchTool";

const LocalArticleSearchInputSchema = z.object({
  query: z.string().describe("The disease or treatment query to search for in Local Coverage Articles."),
  state: z
    .object({ state_id: z.number(), description: z.string() })
    .describe("The full name of the state (e.g., 'Illinois', 'California') as the description and stated_id as a number used to filter local coverage articles."),
});

type StateIdentifier = { state_id: number; description: string };
interface StateMetaData {
  data: Array<StateIdentifier>;
}

const cache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000;

interface LocalCoverageArticle {
  meta: {
    status: {
      id: number;
      message: string;
    };
    notes: string;
    fields: string[];
    children: string[];
  };
  data: Array<{
    document_id: string;
    document_version: number;
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
  }>;
}

class LocalCoverageArticleSearchTool extends StructuredTool<typeof LocalArticleSearchInputSchema> {
  schema = LocalArticleSearchInputSchema;
  name = "local_coverage_article_search";
  description =
    "Searches Local Coverage Articles (LCAs) for a given disease or treatment query within a specific state. " +
    "LCAs provide detailed billing, coding (including ICD-10/CPT), and documentation requirements that support LCDs. " +
    "Returns the article title, display ID, MAC, and the direct URL for relevant LCAs. " +
    "If multiple articles are found, it lists up to 1.";

  private CMS_LOCAL_ARTICLES_API_URL = "https://api.coverage.cms.gov/v1/reports/local-coverage-articles/";

  protected async _call(input: z.infer<typeof LocalArticleSearchInputSchema>): Promise<string> {
    const { query, state } = input;

    // Check cache first
    const cacheKey = JSON.stringify(input);
    const cacheEntry = cache.get(cacheKey);
    if (cacheEntry && (Date.now() - cacheEntry.timestamp) < CACHE_TTL) {
      return cacheEntry.data;
    }

    if (!state?.state_id || !state?.description) {
      return JSON.stringify({
        error: "Invalid state provided",
        message: "Please provide a valid state object with state_id and description."
      });
    }

    const controller = new AbortController();
    const timeout = 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const apiUrl = `${this.CMS_LOCAL_ARTICLES_API_URL}?state_id=${state.state_id}`;
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        return JSON.stringify({
          error: "Failed to fetch articles",
          message: `HTTP error! status: ${response.status}`
        });
      }

      const data: LocalCoverageArticle = await response.json();

      if (!data.data || data.data.length === 0) {
        return JSON.stringify({
          message: `No Local Coverage Articles found for '${query}' in ${state.description}.`,
          results: []
        });
      }

      const queryLower = query.toLowerCase();
      const relevantArticles = data.data.filter(article =>
        article.title && article.title.toLowerCase().includes(queryLower)
      );

      if (relevantArticles.length === 0) {
        return JSON.stringify({
          message: `No relevant Local Coverage Articles found for '${query}' in ${state.description}.`,
          results: []
        });
      }

      const resultCount = Math.min(relevantArticles.length, 1);
      const outputResults = relevantArticles.slice(0, resultCount).map(article => ({
        title: article.title,
        document_id: article.document_display_id,
        mac: article.contractor_name_type,
        url: article.url || '',
        updated_on: article.updated_on,
        effective_date: article.effective_date
      }));

      const result = JSON.stringify({
        message: `Found ${relevantArticles.length} Local Coverage Article(s) for '${query}' in ${state.description}`,
        count: relevantArticles.length,
        results: outputResults
      });

      cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return JSON.stringify({
          error: "Request timed out",
          message: "The request took too long to complete. Please try again with a more specific query."
        });
      }
      return JSON.stringify({
        error: "An error occurred",
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  }
}

export const localCoverageArticleSearchTool = new LocalCoverageArticleSearchTool();
