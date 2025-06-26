import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";

const CignaPriorAuthInputSchema = z.object({
  treatment: z
    .string()
    .describe(
      "The description of the medical service or medication (e.g., 'MRI of the knee', 'Physical Therapy', 'Specialty Drug X'). This is used to search for related codes, descriptions, and comments in the policy document.",
    ),
});

export class CignaPriorAuthLookupTool extends StructuredTool<
  typeof CignaPriorAuthInputSchema
> {
  schema = CignaPriorAuthInputSchema;

  name = "cigna_prior_auth_lookup_tool";

  description = `
    This tool searches for a specific treatment within a Cigna policy document by calling an API route.
    It extracts related codes, descriptions, and comments from the policy document.
    Input should be a JSON object with 'treatment'.
    Example: {"treatment": "MRI of the knee"}
  `;

  constructor() {
    super();
  }

  // Helper function to fetch the parsed PDF content from the API route
  private async fetchParsedPdf(): Promise<string> {
    try {
      // Define the API route URL
      const apiUrl = "http://localhost:3000/api/services/pdf-parse";

      // Fetch the parsed PDF content from the API route
      const response = await fetch(apiUrl);
      console.log(`Fetching parsed PDF content from: ${apiUrl}`);

      if (!response) {
        throw new Error(`Failed to fetch parsed PDF content: ${response}`);
      }

      const data = await response.json();
      return data.text;
    } catch (error) {
      console.error(
        `Error fetching parsed PDF content: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return `Failed to fetch parsed PDF content: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  // The protected `_call` method contains the actual logic of the tool
  public async _call(
    input: z.infer<typeof CignaPriorAuthInputSchema>,
  ): Promise<string> {
    const { treatment } = input;
    console.log(`CignaPriorAuthLookupTool called with treatment: ${treatment}`);

    // Fetch the parsed policy document content from the API route
    const policyContent = await this.fetchParsedPdf();

    // If the content couldn't be fetched, return an error response
    if (
      !policyContent ||
      policyContent.includes("Failed to fetch parsed PDF content")
    ) {
      return JSON.stringify({
        status: "Error",
        message: "Failed to retrieve the parsed policy document content.",
        source_note:
          "Unable to retrieve policy content. The AI cannot determine specific PA requirements without policy text.",
      });
    }

    // Perform a search for the treatment and extract related information
    const normalizedPolicyContent = policyContent.toLowerCase();
    const normalizedTreatment = treatment.toLowerCase();

    // Use a regex to extract lines containing the treatment and related details
    const regex = new RegExp(
      `(${normalizedTreatment}).*?\\s+(\\d+)\\s+([\\w\\s]+)\\s+-\\s+(.+)`,
      "gi",
    );
    const matches = [...policyContent.matchAll(regex)];

    if (matches.length > 0) {
      const extractedData = matches.map((match) => ({
        treatment: match[1],
        code: match[2],
        description: match[3],
        comments: match[4],
      }));

      return JSON.stringify({
        status: "Found",
        message: `Successfully found related information for the treatment '${treatment}' in the policy document.`,
        data: extractedData,
        source_note:
          "The extracted data includes the treatment, code, description, and comments from the policy document.",
      });
    }

    // If no matches are found, return a "not found" response
    return JSON.stringify({
      status: "Not Found",
      message: `No related information for the treatment '${treatment}' was found in the policy document.`,
      source_note:
        "The treatment was not matched within the parsed content of the policy document.",
    });
  }
}
