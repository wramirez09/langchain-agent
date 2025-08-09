import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { cleanRegex } from "./utils";

// Define a schema specific to this tool to avoid naming conflicts
const CarelonSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Carelon guidelines.",
    ),
});

// The API key is provided by the canvas environment, so we leave it as an empty string.
const apiKey = process.env.GOOGLE_LM_API;
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

/**
 * A helper function to call the Gemini API for text summarization with exponential backoff.
 * @param content The text content to be summarized.
 * @param query The user's original query.
 * @returns A string containing the summary or an error message.
 */
async function getSummaryFromDocs(
  content: string,
  query: string,
): Promise<string> {
  const maxRetries = 5;
  let retryCount = 0;
  let delay = 1000; // Start with a 1-second delay

  // Truncate the content to a safe length to prevent token errors
  const safeContent = content.slice(0, 8000);

  const chatHistory = [];
  chatHistory.push({
    role: "user",
    parts: [
      {
        text: `Summarize the following document content based on the user's query. The summary should be concise, factual, and directly address the query.
        
        User's Query: ${query}
        
        Document Content:
        ${safeContent}`,
      },
    ],
  });

  const payload = { contents: chatHistory };

  const performFetchWithRetry = async (): Promise<string> => {
    while (retryCount < maxRetries) {
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (response.status === 429) {
          retryCount++;
          const jitter = Math.random() * 1000; // Add random jitter
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
          delay *= 2; // Exponentially increase the delay
          continue; // Continue the loop to retry
        }

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const result = await response.json();
        if (
          result.candidates &&
          result.candidates.length > 0 &&
          result.candidates[0].content &&
          result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0
        ) {
          console.log({ data: result.candidates[0].content.parts[0].text });
          return result.candidates[0].content.parts[0].text;
        } else {
          throw new Error(
            "Invalid API response structure or no content found.",
          );
        }
      } catch (error: any) {
        console.error("Error during API call:", error);
        throw error;
      }
    }
    throw new Error(`Failed to generate summary after ${maxRetries} retries.`);
  };

  try {
    return await performFetchWithRetry();
  } catch (error: any) {
    return `Failed to generate summary. Error: ${error.message}`;
  }
}

// Implement the tool class
export class CarelonSearchTool extends StructuredTool<
  typeof CarelonSearchInputSchema
> {
  name = "carelon_guidelines_search";
  description =
    "Queries Carelon Guidelines search API and returns a summarized policy using a single, efficient API call.";
  schema = CarelonSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(
    input: any,
  ): Promise<any> {
    try {
      const parsedInput = this.schema.parse({ query: input.query });
      return await this._call(parsedInput);
    } catch (error: any) {
      console.error("Error in CarelonSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  protected async _call(
    input: z.infer<typeof CarelonSearchInputSchema>,
  ): Promise<string> {
    const carlonApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/search?" +
        `q=${input.query}`,
    );

    try {
      const response = await fetch(carlonApiQuery, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const relevantData = await response.json();
      const body: any[] = relevantData.value;

      if (!body || body.length === 0) {
        return `No relevant guidelines found for the query: ${input.query}`;
      }

      // Combine and clean the content into a single string
      const combinedContent = body
        .map((c) =>
          c.content
            .replace(/\.{25}[\s\S]*?\.{25}/g, "")
            .replace(/\\nSTATEMENT[\s\S]*?\.\{4\} 4/g, "")
            .replace(cleanRegex, "")
            .replace(/\r/g, "")
            .replace(/\n/g, ""),
        )
        .join(" ");

      // Pass the entire content to the summarization function in a single call
      const summary = await getSummaryFromDocs(combinedContent, input.query);

      return `Found Carelon Coverage Guideline(s) for '${input.query}'. Here is a summary of the most relevant information:\n\n${summary}`;
    } catch (error: any) {
      console.error("Error in CarelonSearchTool:", error);
      return `An error occurred while searching Carelon guidelines: ${error.message}`;
    }
  }
}
