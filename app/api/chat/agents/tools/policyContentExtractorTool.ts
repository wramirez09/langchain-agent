// policyContentExtractorTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio";
import { llmSummarizer } from "@/lib/llm";
import { StructuredOutputParser } from "langchain/output_parsers";

// ----------------------
// Types & Schemas
// ----------------------

export interface ExtractedPolicyDetails {
  priorAuthRequired: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN";
  medicalNecessityCriteria: string[];
  icd10Codes: { code: string; description: string; context: string }[];
  cptCodes: { code: string; description: string; context: string }[];
  requiredDocumentation: string[];
  limitationsExclusions: string[];
  summary: string;
}

const policyExtractionSchema = z.object({
  priorAuthRequired: z.enum(["YES", "NO", "CONDITIONAL", "UNKNOWN"]),
  medicalNecessityCriteria: z.array(z.string()),
  icd10Codes: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      context: z.string(),
    }),
  ),
  cptCodes: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      context: z.string(),
    }),
  ),
  requiredDocumentation: z.array(z.string()),
  limitationsExclusions: z.array(z.string()),
  summary: z.string(),
});

const parser = StructuredOutputParser.fromZodSchema(policyExtractionSchema);

// Tool input schema: only needs a URL
const toolInputSchema = z.object({
  policyUrl: z.string().url(),
});

// ----------------------
// Extraction Logic
// ----------------------

export async function getStructuredPolicyDetails(
  content: string,
): Promise<ExtractedPolicyDetails | null> {


  const prompt = `You are an expert healthcare policy analyst. Your task is to analyze the provided policy text and extract structured information according to the following schema:
  
  1. PRIOR AUTHORIZATION REQUIREMENTS:
     - Determine if prior authorization is required (YES/NO/CONDITIONAL/UNKNOWN)
     - Look for terms like "prior auth", "prior approval", "precertification", "preauthorization"
     - Consider any conditions or exceptions mentioned
  
  2. MEDICAL NECESSITY CRITERIA:
     - Extract all specific medical necessity requirements
     - Include any clinical guidelines or criteria mentioned
     - Note any patient-specific factors that affect coverage
  
  3. ICD-10 CODES:
     - Extract all ICD-10 diagnosis codes (format: letter + digits, e.g., E11.65)
     - For each code, provide:
       - The exact code
       - Description (if available in text)
       - Context/section where the code appears
  
  4. CPT/HCPCS CODES:
     - Extract all CPT (5 digits) and HCPCS (letter + 4 digits) codes
     - For each code, provide:
       - The exact code
       - Description (if available in text)
       - Context/section where the code appears
  
  5. REQUIRED DOCUMENTATION:
     - List all documentation required for prior authorization
     - Include any specific forms, clinical notes, or test results mentioned
     - Note any special formatting or submission requirements
  
  6. LIMITATIONS & EXCLUSIONS:
     - List any specific limitations on coverage
     - Note any explicit exclusions
     - Include any frequency or duration limits
  
  7. POLICY SUMMARY:
     - Provide a concise 3-5 sentence summary of the policy
     - Highlight the most important coverage criteria
     - Note any special considerations or exceptions
  
  Policy Text to Analyze:
  ${content}
  
  ${parser.getFormatInstructions()}
  
  IMPORTANT:
  - Be thorough but concise in your extractions
  - Only include information explicitly stated in the text
  - Use "UNKNOWN" rather than making assumptions
  - If a section doesn't apply, return an empty array or appropriate default
  - Ensure all dates, codes, and requirements are accurately extracted`;

  try {
    const response = await llmSummarizer.invoke([{ role: "user", content: prompt }]);
    const rawText = response.content?.toString() ?? "";
    return await parser.parse(rawText);
  } catch (error) {
    console.error("Error extracting policy details:", error);
    return null;
  }
}


// ----------------------
// Tool Implementation
// ----------------------

class PolicyContentExtractorTool extends StructuredTool<
  z.infer<typeof toolInputSchema>
> {
  name = "policy_content_extractor";
  description =
    "Fetches the full content of a Medicare policy document (NCD, LCD, or Article) from its URL and returns a structured JSON object. The object contains specific details like medical necessity criteria, ICD-10 and CPT codes, required documentation, and limitations. This tool is designed to provide a machine-readable summary for AI analysis.";
  schema = toolInputSchema as any;

  public async _call(input: z.infer<typeof toolInputSchema>): Promise<string> {
    const { policyUrl } = input;
    console.log(`Fetching and extracting content from: ${policyUrl}`);

    // Set up abort controller with max listeners
    const controller = new AbortController();
    const signal = controller.signal;

    // Type assertion to access EventTarget methods
    const eventTarget = signal as unknown as EventTarget & { setMaxListeners?: (n: number) => void };
    if (eventTarget.setMaxListeners) {
      eventTarget.setMaxListeners(1500);
    }

    const timeout = setTimeout(() => {
      if (!signal.aborted) {
        controller.abort();
      }
    }, 30000);

    try {
      // Check if this is a CMS NCD URL and use the direct CMS page
      const ncdMatch = policyUrl.match(/ncdid=([^&]+)/);
      let fetchUrl = policyUrl;

      // If it's a CMS NCD URL, use the direct CMS page instead of the API
      if (ncdMatch) {
        const ncdId = ncdMatch[1];
        fetchUrl = `https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=${ncdId}`;
        console.log(`Fetching NCD content from CMS page: ${fetchUrl}`);
      }

      const response = await fetch(fetchUrl, { signal });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch policy content: ${response.status} ${response.statusText}`,
        );
      }

      // Clear the timeout if the request succeeds
      clearTimeout(timeout);
      const contentType = response.headers.get('content-type') || '';
      let extractedText: string;

      if (contentType.includes('application/json')) {
        // Handle CMS API JSON response
        const data = await response.json();
        if (data && data.data && data.data.content) {
          // If we have structured content, use it
          extractedText = data.data.content;
        } else {
          // Fallback to stringifying the response
          extractedText = JSON.stringify(data, null, 2);
        }
      } else {
        // Handle regular HTML response
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract the main content, removing scripts, styles, and other non-content elements
        $('script, style, nav, footer, header, iframe, noscript').remove();

        // Get the text content
        extractedText = $('body').text()
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim();
      }

      // Clean up the extracted text
      extractedText = extractedText.replace(/\s+/g, ' ').trim();

      if (extractedText.length < 100) {
        const warning = `Extracted content too short for ${policyUrl}.`;
        console.warn(warning);
        return JSON.stringify({
          error: warning,
          details:
            "HTML structure might have changed or content is minimal. Please review the URL directly.",
        });
      }

      const structuredDetails = await getStructuredPolicyDetails(extractedText);
      if (structuredDetails) {
        return JSON.stringify({
          policyUrl,
          ...structuredDetails,
        });
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

// Instantiate and export
export const policyContentExtractorTool = new PolicyContentExtractorTool();
