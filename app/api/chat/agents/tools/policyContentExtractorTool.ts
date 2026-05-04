import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio";
import { llmSummarizer } from "@/lib/llm";
import { StructuredOutputParser } from "langchain/output_parsers";
import { cache, TTL } from "@/lib/cache";

const POLICY_EXTRACT_MAX_CHARS = 25_000;

// SECURITY: SSRF allowlist. policyUrls is LLM-controlled and prompt-
// injectable; without this guard the agent can fetch cloud-metadata
// endpoints (169.254.169.254), internal services, or file:// URLs.
// Hosts are matched as exact suffix on the URL hostname.
const ALLOWED_POLICY_HOST_SUFFIXES = [
  "cms.gov",
  "hhs.gov",
  "medicare.gov",
  "noridianmedicare.com",
  "palmettogba.com",
  "ngsmedicare.com",
  "novitas-solutions.com",
  "wpsgha.com",
  "fcso.com",
  "cgsmedicare.com",
];

function isAllowedPolicyUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_POLICY_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith("." + suffix),
  );
}

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

const parser = StructuredOutputParser.fromZodSchema(policyExtractionSchema as any);

const toolInputSchema = z.object({
  policyUrls: z.array(z.url()).min(1).max(3).describe(
    "One to three policy URLs to fetch in parallel. Always pass all relevant URLs in a single call."
  ),
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
    const response = await llmSummarizer().invoke([{ role: "user", content: prompt }]);
    const rawText = response.content?.toString() ?? "";
    return await parser.parse(rawText) as ExtractedPolicyDetails;
  } catch (error) {
    console.error("Error extracting policy details:", error);
    return null;
  }
}

class PolicyContentExtractorTool extends StructuredTool<
  z.infer<typeof toolInputSchema>
> {
  name = "policy_content_extractor";
  description =
    "Fetches the full content of Medicare policy documents (NCD, LCD, or Articles) from their URLs and returns structured JSON with medical necessity criteria, ICD-10/CPT codes, required documentation, and limitations. " +
    "Pass all relevant URLs in a single call (up to 3) — they are fetched in parallel. " +
    "Input: { policyUrls: string[] }. Output: array of extracted policy objects.";
  schema = toolInputSchema as any;

  private async extractOne(policyUrl: string): Promise<string> {
    const urlStart = Date.now();
    const cacheKey = `policy-extract:${policyUrl}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      console.log(`[PolicyContentExtractorTool] Cache hit for: ${policyUrl}`);
      return cached;
    }

    console.log(`[PolicyContentExtractorTool] Fetching: ${policyUrl}`);

    const controller = new AbortController();
    const signal = controller.signal;
    const eventTarget = signal as unknown as EventTarget & { setMaxListeners?: (n: number) => void };
    if (eventTarget.setMaxListeners) eventTarget.setMaxListeners(1500);
    const timeout = setTimeout(() => { if (!signal.aborted) controller.abort(); }, 30000);

    try {
      const ncdMatch = policyUrl.match(/ncdid=([^&]+)/);
      const fetchUrl = ncdMatch
        ? `https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=${ncdMatch[1]}`
        : policyUrl;

      if (!isAllowedPolicyUrl(fetchUrl)) {
        clearTimeout(timeout);
        console.warn(
          `[PolicyContentExtractorTool] Rejecting non-allowlisted host: ${fetchUrl}`,
        );
        return JSON.stringify({
          error: `URL host not in allowlist: ${policyUrl}`,
          policyUrl,
        });
      }

      const fetchStart = Date.now();
      // redirect: 'manual' so the allowlisted host can't bounce us into an
      // internal one. Any 3xx Location is re-validated against the allowlist.
      let response = await fetch(fetchUrl, { signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location") ?? "";
        const next = new URL(location, fetchUrl).toString();
        if (!isAllowedPolicyUrl(next)) {
          clearTimeout(timeout);
          return JSON.stringify({
            error: `Redirect target not in allowlist: ${policyUrl}`,
            policyUrl,
          });
        }
        response = await fetch(next, { signal, redirect: "manual" });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

      clearTimeout(timeout);
      console.log(`[PolicyContentExtractorTool] URL fetch: ${Date.now() - fetchStart}ms`);

      let extractedText: string;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        extractedText = data?.data?.content ?? JSON.stringify(data, null, 2);
      } else {
        const html = await response.text();
        const $ = cheerio.load(html);
        $('script, style, nav, footer, header, iframe, noscript').remove();
        extractedText = $('body').text().replace(/\s+/g, ' ').trim();
      }

      extractedText = extractedText.replace(/\s+/g, ' ').trim();
      const originalLen = extractedText.length;
      if (extractedText.length > POLICY_EXTRACT_MAX_CHARS) {
        extractedText = extractedText.slice(0, POLICY_EXTRACT_MAX_CHARS);
      }
      console.log(`[PolicyContentExtractorTool] Extracted text: ${originalLen} chars → ${extractedText.length} chars`);

      if (extractedText.length < 100) {
        return JSON.stringify({ error: `Content too short for ${policyUrl}`, policyUrl });
      }

      const llmStart = Date.now();
      const structuredDetails = await getStructuredPolicyDetails(extractedText);
      console.log(`[PolicyContentExtractorTool] LLM extraction: ${Date.now() - llmStart}ms, total: ${Date.now() - urlStart}ms`);

      if (!structuredDetails) {
        return JSON.stringify({ error: `Extraction failed for ${policyUrl}`, policyUrl });
      }

      const output = JSON.stringify({ policyUrl, ...structuredDetails });
      console.log(`[PolicyContentExtractorTool] Output: ${output.length} chars (~${(output.length / 1024).toFixed(1)}KB)`);
      cache.set(cacheKey, output, TTL.LONG);
      return output;
    } catch (error: any) {
      clearTimeout(timeout);
      console.error(`[PolicyContentExtractorTool] Error for ${policyUrl}:`, error.message);
      return JSON.stringify({ error: error.message, policyUrl });
    }
  }

  public async _call(input: z.infer<typeof toolInputSchema>): Promise<string> {
    const { policyUrls } = input;
    const toolStart = Date.now();
    console.log(`[PolicyContentExtractorTool] Processing ${policyUrls.length} URL(s) in parallel`);

    const results = await Promise.all(policyUrls.map(url => this.extractOne(url)));

    console.log(`[PolicyContentExtractorTool] All extractions done: ${Date.now() - toolStart}ms`);
    return results.length === 1 ? results[0] : JSON.stringify(results);
  }
}

// Instantiate and export
export const policyContentExtractorTool = new PolicyContentExtractorTool();
