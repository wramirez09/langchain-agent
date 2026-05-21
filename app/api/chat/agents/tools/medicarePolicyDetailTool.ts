import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { cache, TTL } from "@/lib/cache";
import { cmsCoverageApiClient } from "./utils/cmsCoverageApiClient";

const inputSchema = z.object({
  documentType: z.enum(["ncd", "lcd", "article"]),
  documentId: z.string().min(1),
  documentVersion: z.number().int().nonnegative(),
});

// Negative-result TTL: when a fetch fails (404, malformed input, etc.) the
// agent must not retry the same (type,id,version) inside the same run. The
// prompt forbids it, but prompt-only enforcement is unreliable. A short
// in-process cache replays the same error for ~1 minute, which covers any
// single agent turn (max 300s wall, typically <60s) without leaking error
// state across distinct requests for long.
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;

function negativeCacheKey(
  type: string,
  id: string,
  version: number,
): string {
  return `cms-detail-error:${type}:${id}:${version}`;
}

function positiveCacheKey(
  type: string,
  id: string,
  version: number,
): string {
  return `cms-detail:${type}:${id}:${version}`;
}

// In-flight dedupe: when two concurrent agent turns ask for the same
// (type, id, version), the second one waits on the first's promise instead
// of firing a duplicate CMS request. Entries are cleared on settle, so the
// positive cache becomes the long-term lookup.
const inflight = new Map<string, Promise<string>>();

class MedicarePolicyDetailTool extends StructuredTool<typeof inputSchema> {
  name = "medicare_policy_detail";
  schema = inputSchema;
  description =
    "Fetches structured Medicare policy details (medical necessity criteria, ICD-10/CPT codes, " +
    "documentation requirements, limitations) directly from the CMS Coverage API. " +
    "Use this tool for any CMS-hosted Medicare policy (NCD, LCD, Article). " +
    "Do NOT use `policy_content_extractor` for CMS URLs — only use that for MAC contractor URLs " +
    "(Noridian, Palmetto, NGS, Novitas, WPS, FCSO, CGS).\n\n" +
    "**Input:** `{ documentType: \"ncd\" | \"lcd\" | \"article\", documentId, documentVersion }` — " +
    "use the values returned by `ncd_coverage_search`, `local_lcd_search`, or " +
    "`local_coverage_article_search` on each `topMatches[]` entry.\n\n" +
    "**Output:** JSON with priorAuthRequired, medicalNecessityCriteria, icd10Codes, cptCodes, " +
    "requiredDocumentation, limitationsExclusions, and summary — same shape as policy_content_extractor.";

  async _call(input: z.infer<typeof inputSchema>): Promise<string> {
    const { documentType, documentId, documentVersion } = input;
    const start = Date.now();

    const negKey = negativeCacheKey(documentType, documentId, documentVersion);
    const cachedError = cache.get<string>(negKey);
    if (cachedError) {
      console.warn(
        `[MedicarePolicyDetailTool] Replaying cached error for ${documentType} ${documentId} v${documentVersion} (no retry within ${NEGATIVE_CACHE_TTL_MS}ms)`,
      );
      return cachedError;
    }

    // Positive cache: (documentId, documentVersion) is immutable — CMS mints a
    // new version when a policy changes — so a hit can safely replay without
    // a network round-trip. Saves the full CMS API fetch (~300-900ms) per
    // repeat lookup, including across distinct user requests.
    const posKey = positiveCacheKey(documentType, documentId, documentVersion);
    const cachedDetail = cache.get<string>(posKey);
    if (cachedDetail) {
      console.log(
        `[MedicarePolicyDetailTool] Cache hit for ${documentType} ${documentId} v${documentVersion}`,
      );
      return cachedDetail;
    }

    // In-flight dedupe: piggyback on any concurrent fetch for the same key.
    const pending = inflight.get(posKey);
    if (pending) {
      console.log(
        `[MedicarePolicyDetailTool] In-flight hit for ${documentType} ${documentId} v${documentVersion}`,
      );
      return pending;
    }

    // The in-flight promise resolves with the final string (success or
    // structured error). Folding the error path inside guarantees the
    // primary caller and any concurrent piggybackers receive identical
    // output — and the negative cache is set exactly once.
    const fetchPromise = (async () => {
      try {
        const details =
          documentType === "ncd"
            ? await cmsCoverageApiClient.fetchNcd(documentId, documentVersion)
            : documentType === "lcd"
              ? await cmsCoverageApiClient.fetchLcd(documentId, documentVersion)
              : await cmsCoverageApiClient.fetchArticle(documentId, documentVersion);

        const out = JSON.stringify({
          documentType,
          documentId,
          documentVersion,
          ...details,
        });
        console.log(
          `[MedicarePolicyDetailTool] ${documentType} ${documentId} v${documentVersion}: ${out.length} chars (~${(
            out.length / 1024
          ).toFixed(1)}KB) in ${Date.now() - start}ms`,
        );
        cache.set(posKey, out, TTL.VERY_LONG);
        return out;
      } catch (err: any) {
        console.error(
          `[MedicarePolicyDetailTool] Error for ${documentType} ${documentId}:`,
          err?.message ?? err,
        );
        const errOut = JSON.stringify({
          error: err?.message ?? "Unknown CMS Coverage API error",
          documentType,
          documentId,
          documentVersion,
        });
        cache.set(negKey, errOut, NEGATIVE_CACHE_TTL_MS);
        return errOut;
      } finally {
        inflight.delete(posKey);
      }
    })();

    inflight.set(posKey, fetchPromise);
    return fetchPromise;
  }
}

export const medicarePolicyDetailTool = new MedicarePolicyDetailTool();
