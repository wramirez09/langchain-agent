import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";


// Define the input schema for the tool using Zod
const SupabaseRetrievalInputSchema = z.object({
  tableName: z
    .string()
    .describe(
      "The name of the Supabase table to retrieve documents from, e.g., 'documents'.",
    ),
});

/**
 * A tool to retrieve all documents from a specified Supabase table.
 * This is useful for providing an LLM with the full context of all stored policy documents.
 */
export class SupabaseRetrievalTool extends StructuredTool<
  typeof SupabaseRetrievalInputSchema
> {
  schema = SupabaseRetrievalInputSchema;
  name = "retrieve_all_policy_data";
  description = `
    Useful for retrieving the full content of all policy documents stored in a Supabase table.
    The tool takes a 'tableName' as input and returns a string containing the concatenated text
    of all documents. This is a comprehensive retrieval method, providing the LLM with the
    entire dataset for analysis rather than a filtered search.
    Example: {"tableName": "documents"}
  `;

  protected async _call(
    input: z.infer<typeof SupabaseRetrievalInputSchema>,
  ): Promise<string> {
    const { tableName } = input;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PRIVATE_KEY = process.env.SUPABASE_PRIVATE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PRIVATE_KEY) {
      return "Error: Supabase URL or private key not found in environment variables.";
    }

    try {
      // Initialize Supabase client
      const supabase = createClient(SUPABASE_URL, SUPABASE_PRIVATE_KEY);

      // Call the retrieval logic based on your provided code
      const { data, error } = await supabase.from(tableName).select("*");

      if (error) {
        console.error("Error retrieving documents from Supabase:", error);
        return `Error retrieving documents from Supabase: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return "No documents found in the specified table.";
      }

      // Concatenate the content of all documents into a single string for the LLM
      const combinedContent = data
        .map((doc) => doc.content)
        .join("\n\n---\n\n");
      return combinedContent;
    } catch (error) {
      console.error("Unexpected error during Supabase retrieval:", error);
      return `Unexpected error during Supabase retrieval: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
