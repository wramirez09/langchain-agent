import type { PriorAuthArtifact } from "@/lib/priorAuth/artifactSchema";
import { redactPhi } from "@/lib/phi/redact";

/**
 * De-identify a finished artifact before it leaves the server.
 *
 * The browser path redacts notes before they cross the network, but the MCP
 * surface takes whatever text a third-party client sends, and the agent
 * echoes that text back into `medicalHistory`, `keyFindings`, rationales and
 * so on. Everything the screening returns — the JSON block, the markdown
 * block, `structuredContent` and so the card — is built from the output of
 * this function, so it is the one place to scrub.
 *
 * Only free-text fields are touched. Codes, policy ids, URLs and enum values
 * are skipped: the digit-run, ZIP and URL rules would otherwise eat CPT codes
 * and CMS links, and none of those fields can carry a patient identifier.
 * The `review` subtree is skipped too — its labels and messages come from a
 * fixed template catalog by contract (see `review/types.ts`), and its paths
 * and ids are machine values.
 */

const SKIP_KEYS = new Set([
  "kind",
  "schemaVersion",
  "guidelineBasis",
  "priorAuthRequired",
  "status",
  "type",
  "determination",
  "code",
  "policyId",
  "url",
  "review",
]);

export interface ArtifactRedaction {
  artifact: PriorAuthArtifact;
  /** identifiers replaced, across every field */
  total: number;
}

function redactValue(v: unknown, counter: { n: number }): unknown {
  if (typeof v === "string") {
    const r = redactPhi(v);
    counter.n += r.total;
    return r.total ? r.redacted : v;
  }
  if (Array.isArray(v)) return v.map((x) => redactValue(x, counter));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      out[k] = SKIP_KEYS.has(k) ? x : redactValue(x, counter);
    }
    return out;
  }
  return v;
}

/**
 * Counts only in the notice — it must never name what was removed. An
 * existing `phiNotice` is kept and the count appended, so nothing the agent
 * said is dropped.
 */
export function redactionNotice(total: number): string {
  return `${total} ${total === 1 ? "identifier was" : "identifiers were"} removed from this report.`;
}

export function redactArtifact(a: PriorAuthArtifact): ArtifactRedaction {
  const counter = { n: 0 };
  const artifact = redactValue(a, counter) as PriorAuthArtifact;
  if (counter.n > 0) {
    const notice = redactionNotice(counter.n);
    artifact.phiNotice = artifact.phiNotice
      ? `${artifact.phiNotice} ${notice}`
      : notice;
  }
  return { artifact, total: counter.n };
}

/** Same scrub for the plain-text fallback answer. */
export function redactText(text: string): string {
  return redactPhi(text).redacted;
}
