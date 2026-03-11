
import { Tool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";
import { llmSummarizer } from "@/lib/llm";
import * as cheerio from "cheerio";
import { data as statesData } from "@/app/agents/metaData/states";

const ARTICLE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
  private async fetchAndSummarizeArticle(url: string, query: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return "[Failed to fetch article content]";

      const html = await response.text();
      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, iframe, noscript, dialog, [role='dialog'], .modal, .modal-dialog, .modal-content, .ui-dialog, .popup, .overlay").remove();
      const plainText = $("body").text().replace(/\s+/g, " ").trim().substring(0, 25000);

      const messages = [
        {
          type: "system" as const,
          content: "You are an expert healthcare billing and coding analyst. Extract all billing and coding information from Medicare Local Coverage Articles with high fidelity. Preserve specific codes verbatim — do not paraphrase or generalize."
        },
        {
          type: "human" as const,
          content: `Analyze this Medicare Billing & Coding Article as it relates to: "${query}"\n\nExtract and preserve ALL of the following with maximum specificity:\n1. **ICD-10 codes** — list EVERY specific code and full description (e.g., M25.561 Pain in right knee, M25.562 Pain in left knee)\n2. **CPT/HCPCS codes** — list EVERY code or code range with descriptions (e.g., 73721 MRI lower extremity without contrast)\n3. **Covered indications** — list each diagnosis or condition covered with its specific code(s)\n4. **Non-covered indications** — list each excluded condition or code\n5. **Billing instructions** — any special billing or modifier requirements\n6. **Referenced LCD IDs** — any LCD document IDs cited (e.g., L33558)\n\nIf a section is not present, state "Not specified in document."\n\nDocument content:\n${plainText}`
        }
      ];

      const summary = await llmSummarizer().invoke(messages);
      return summary.content as string;
    } catch (error: unknown) {
      console.error("Error fetching and summarizing article:", error);
      return "[Failed to summarize article]";
    }
  }

  name = "local_coverage_article_search";
  description =
    "Searches Local Coverage Articles (LCAs) for a given disease or treatment query within a specific state. " +
    "LCAs contain the specific ICD-10 and CPT/HCPCS billing codes, covered/non-covered indications, and documentation requirements that support LCDs. " +
    "Input must be a JSON string with fields: 'query' (string) and 'state_name' (exact U.S. state name, e.g. 'Illinois'). Do NOT include a numeric state_id — the tool resolves it internally. " +
    "Returns full article summaries with all extracted codes inline. Lists up to 3 matching articles.";

  private CMS_LOCAL_ARTICLES_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-articles/";

  protected async _call(input: string): Promise<string> {
    const cached = cache.get<string>(input);
    if (cached) {
      console.log("LocalCoverageArticleSearchTool: Cache hit!");
      return cached;
    }

    let query: string;
    let state_name: string;
    try {
      ({ query, state_name } = JSON.parse(input));
    } catch {
      return `Error: Invalid input format. Expected JSON with 'query' and 'state_name' fields.`;
    }

    // Resolve state_name → CMS state_id from the authoritative states list.
    const stateRecord = statesData.find(
      (s) => s.description.toLowerCase() === state_name.toLowerCase()
    );
    if (!stateRecord) {
      return `Error: Could not find a valid state ID for '${state_name}'. Valid state names include: ${statesData.map(s => s.description).join(", ")}`;
    }
    const stateId = stateRecord.state_id;
    console.log(`LocalCoverageArticleSearchTool: Resolved '${state_name}' → state_id ${stateId}`);

    try {

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
          `Failed to fetch local articles for ${state_name} (state_id: ${stateId}): ${response.status} ${response.statusText}`,
        );
      }
      const allArticles: LocalCoverageArticle = await response.json();

      // 3. Perform client-side filtering.
      const queryLower = query.toLowerCase();
      const p1 = queryLower.split("(")[0].trim();
      const parenStart = queryLower.indexOf("(");
      const parenEnd = queryLower.indexOf(")");
      const p2 = parenStart !== -1 && parenEnd > parenStart
        ? queryLower.substring(parenStart + 1, parenEnd).trim()
        : "";

      const stopWords = new Set(["the", "and", "for", "with", "without", "using", "services"]);
      const queryTokens = (p1 || queryLower)
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !stopWords.has(t));

      const relevantArticles = allArticles.data.filter((article) => {
        const titleLower = (article.title || "").toLowerCase();
        if ((p1 && titleLower.includes(p1)) || (p2 && titleLower.includes(p2))) return true;
        const matchedTokens = queryTokens.filter((t) => titleLower.includes(t));
        return queryTokens.length === 1
          ? matchedTokens.length >= 1
          : matchedTokens.length >= 2;
      });

      if (relevantArticles.length === 0) {
        return `No Local Coverage Article found for '${query}' in ${state_name} (state_id: ${stateId}).`;
      }

      const maxResults = Math.min(relevantArticles.length, 3);

      const outputResults = await Promise.all(
        relevantArticles.slice(0, maxResults).map(async (article) => {
          const summary = article.url
            ? await this.fetchAndSummarizeArticle(article.url, query)
            : "[No URL available for summarization]";
          return (
            `## ${article.title} (ID: ${article.document_display_id || "N/A"})\n` +
            `- **MAC:** ${article.contractor_name_type || "N/A"}\n` +
            `- **Effective Date:** ${article.effective_date || "N/A"}\n` +
            `- **Last Updated:** ${article.updated_on || "N/A"}\n` +
            `- **Summary:** ${summary}\n` +
            `- **Direct URL:** ${article.url || "N/A"}\n`
          );
        })
      );

      console.log(`${outputResults.length} Article(s) found and summarized`);

      const result =
        `Found ${relevantArticles.length} Local Coverage Article(s) for '${query}' in ${state_name}. ` +
        `Displaying top ${maxResults} with summaries:\n\n` +
        outputResults.join("\n\n");

      cache.set(input, result, ARTICLE_CACHE_TTL);
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
