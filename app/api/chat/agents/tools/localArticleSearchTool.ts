import { z } from "zod";
import { Tool } from "@langchain/core/tools";



type StateIdentifier = { state_id: number; description: string };
// Interface for state metadata (re-used)
interface StateMetaData {
  data: Array<StateIdentifier>;
}

// Interface for the expected structure of a Local Coverage Article from the API
const cache = new Map<string, string>();

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

class LocalCoverageArticleSearchTool extends Tool {
  name = "local_coverage_article_search";
  description =
    "Searches Local Coverage Articles (LCAs) for a given disease or treatment query within a specific state. " +
    "LCAs provide detailed billing, coding (including ICD-10/CPT), and documentation requirements that support LCDs. " +
    "Returns the article title, display ID, MAC, and the direct URL for relevant LCAs. " +
    "If multiple articles are found, it lists up to 1.";

  private CMS_LOCAL_ARTICLES_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-articles/";

  protected async _call(input: string): Promise<string> {
    if (cache.has(input)) {
      console.log("LocalCoverageArticleSearchTool: Cache hit!");
      return cache.get(input)!;
    }
    const { query, state } = JSON.parse(input);

    console.log(
      `Searching Local Coverage Articles for query: '${query}' in state: '${state.description}'`,
    );
    try {
      const stateId = state.state_id;

      if (!stateId) {
        return `Error: Could not find a valid state ID for '${state}'. Please provide a full, valid U.S. state name.`;
      }

      // 2. Fetch Local Coverage Articles for the specific state and 'Final' status.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(
        `${this.CMS_LOCAL_ARTICLES_API_URL}?state_id=${stateId}`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch local articles for ${state}: ${response.status} ${response.statusText}`,
        );
      }
      const allArticles: LocalCoverageArticle = await response.json();

      // 3. Perform client-side filtering.
      const queryLower = query.toLowerCase();
      const relevantArticles = allArticles.data.filter((article) => {
        const titleLower = (article.title || "").toLowerCase();
        const p1 = queryLower.split("(")[0].trim();
        const p2 = queryLower
          .substring(queryLower.indexOf("(") + 1, queryLower.indexOf(")"))
          .trim();

        if (titleLower.includes(p1) || titleLower.includes(p2)) return article;
      });

      if (relevantArticles.length === 0) {
        return `No Local Coverage Article found for '${query}' in ${state}.`;
      }

      const outputResults: string[] = [];
      for (let i = 0; i < Math.min(relevantArticles.length, 10); i++) {
        const article = relevantArticles[i];
        // Construct full URL for the detailed article page.
        const fullHtmlUrl = article.url;

        outputResults.push(
          `
          Title: ${article.title}
          Type: ${article.contractor_name_type}
          Contractor: ${article.contractor_name_type}
          Effective Date: ${article.effective_date}
          Article URL: ${article.url}
          `,
        );
      }

      const result = `Found ${relevantArticles.length} Local Coverage Article(s) for '${query}' in ${state}. ` +
        `Displaying top ${Math.min(relevantArticles.length, 5)}:\n` +
        outputResults.join("\n");

      cache.set(input, result);
      return result;
    } catch (error: any) {
      console.error("Error in LocalCoverageArticleSearchTool:", error);
      return `An error occurred while searching for local articles: ${error.message}`;
    }
  }
}

// Instantiate and export the tool.
export const localCoverageArticleSearchTool =
  new LocalCoverageArticleSearchTool();
