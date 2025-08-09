// policyContentExtractorTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio"; // For HTML parsing: npm install cheerio

// Input schema for the content extractor tool
const PolicyContentExtractorInputSchema = z.object({
  policyUrl: z
    .string()
    .url()
    .describe(
      "The full URL of the Medicare policy document (NCD, LCD, or Article) to extract content from.",
    ),
});

// Interface for the structured details you *aim* to extract from the policy text.
export interface ExtractedPolicyDetails {
  priorAuthRequired: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN";
  medicalNecessityCriteria: string[];
  icd10Codes: { code: string; description: string; context: string }[]; // context: e.g., 'covered', 'excluded'
  cptCodes: { code: string; description: string; context: string }[];
  requiredDocumentation: string[];
  limitationsExclusions: string[];
  summary: string;
}

/**
 * A helper function to call the Gemini API for structured data extraction.
 * @param content The text content to be parsed.
 * @returns A JSON object matching the ExtractedPolicyDetails interface or null on failure.
 */
async function getStructuredPolicyDetails(
  content: string,
): Promise<ExtractedPolicyDetails | null> {
  const chatHistory = [];
  chatHistory.push({
    role: "user",
    parts: [
      {
        text: `Extract the following information from the policy text and return it as a JSON object: 
        - priorAuthRequired: Is prior authorization required? (YES, NO, CONDITIONAL, UNKNOWN)
        - medicalNecessityCriteria: A bulleted list of all clinical conditions, patient characteristics, or prior treatments required for coverage.
        - icd10Codes: A list of codes with a description and context (e.g., covered or excluded).
        - cptCodes: A list of codes with a description and context.
        - requiredDocumentation: A checklist of specific medical records and notes needed for submission.
        - limitationsExclusions: Any situations where the treatment is not covered or has restrictions.
        - summary: A brief explanation of the policy's stance on the treatment.
        
        Policy Text:
        ${content}`,
      },
    ],
  });

  const payload = {
    contents: chatHistory,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          priorAuthRequired: { type: "STRING" },
          medicalNecessityCriteria: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          icd10Codes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                code: { type: "STRING" },
                description: { type: "STRING" },
                context: { type: "STRING" },
              },
            },
          },
          cptCodes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                code: { type: "STRING" },
                description: { type: "STRING" },
                context: { type: "STRING" },
              },
            },
          },
          requiredDocumentation: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          limitationsExclusions: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          summary: { type: "STRING" },
        },
      },
    },
  };

  const apiKey = process.env.GOOGLE_LM_API;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (
      result.candidates &&
      result.candidates.length > 0 &&
      result.candidates[0].content &&
      result.candidates[0].content.parts &&
      result.candidates[0].content.parts.length > 0
    ) {
      const jsonString = result.candidates[0].content.parts[0].text;
      return JSON.parse(jsonString) as ExtractedPolicyDetails;
    }
    console.error("Gemini API response structure is unexpected.");
    return null;
  } catch (error) {
    console.error("Error calling Gemini API for extraction:", error);
    return null;
  }
}

class PolicyContentExtractorTool extends StructuredTool<
  typeof PolicyContentExtractorInputSchema
> {
  name = "policy_content_extractor";
  description =
    "Fetches the full content of a Medicare policy document (NCD, LCD, or Article) from its URL and returns a structured JSON object. The object contains specific details like medical necessity criteria, ICD-10 and CPT codes, required documentation, and limitations. This tool is designed to provide a machine-readable summary for AI analysis.";
  schema = PolicyContentExtractorInputSchema;

  /**
   * The core logic of the tool.
   * Fetches the HTML, extracts the main text, and uses an LLM to parse it into a structured object.
   * @param input The validated input from the LLM, matching PolicyContentExtractorInputSchema.
   * @returns A JSON object containing the extracted policy details or an error message string.
   */
  public async _call(
    input: z.infer<typeof PolicyContentExtractorInputSchema>,
  ): Promise<string> {
    const { policyUrl } = input;

    console.log({ medicarePolicyURL: policyUrl });

    try {
      const response = await fetch(policyUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch policy content from ${policyUrl}: ${response.status} ${response.statusText}`,
        );
      }
      const htmlContent = await response.text();
      const $ = cheerio.load(htmlContent);

      let extractedText = "";
      // Use more robust selectors for common policy document structures
      const selectors =
        "div.document-view-section, .article-content, .coverage-summary";
      const elements = $(selectors);
      elements.each((index, div) => {
        extractedText += $(div).text().trim() + " ";
      });

      // If no suitable element was found, fall back to the entire body
      if (!extractedText) {
        extractedText = $("body").text().trim();
      }

      extractedText = extractedText.replace(/\s+/g, " ").trim(); // Replace multiple spaces/newlines with single space

      if (extractedText.length < 100) {
        const warning = `Extracted content too short for ${policyUrl}.`;
        console.warn(warning);
        return JSON.stringify({
          error: warning,
          details:
            "HTML structure might have changed or content is minimal. Please review the URL directly.",
        });
      }

      // Use the internal LLM call to get structured JSON from the extracted text
      const structuredDetails = await getStructuredPolicyDetails(extractedText);
      if (structuredDetails) {
        // Return the JSON string so the calling LLM can process it as an object
        return JSON.stringify(structuredDetails);
      } else {
        const errorMsg = `An error occurred during structured extraction from ${policyUrl}.`;
        console.error(errorMsg);
        return JSON.stringify({
          error: errorMsg,
          details:
            "The LLM failed to parse the content into the expected JSON format.",
        });
      }
    } catch (error: any) {
      console.error("Error in PolicyContentExtractorTool:", error);
      return JSON.stringify({
        error: `An error occurred while extracting policy content from ${policyUrl}`,
        details: error.message,
      });
    }
  }
}

// Instantiate and export the tool.
export const policyContentExtractorTool = new PolicyContentExtractorTool();
