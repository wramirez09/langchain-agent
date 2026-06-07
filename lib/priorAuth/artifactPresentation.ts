import type { Determination } from "@/lib/priorAuth/artifactSchema";

/**
 * Presentation logic shared by the web artifact renderer
 * (components/prior-auth/artifact/ArtifactSections.tsx) and the PDF export
 * (components/pdf/ArtifactPdfDoc.tsx). Pure data — each renderer maps a
 * `Tone` onto its own styling (Tailwind classes vs. react-pdf hex styles).
 */

export type Tone = "amber" | "green" | "red" | "blue" | "neutral";

export const DETERMINATION_TONE: Record<Determination, Tone> = {
  meets_criteria: "green",
  conditional: "amber",
  more_info_needed: "amber",
  likely_denial: "red",
  not_supported: "red",
};

export const GUIDELINE_LABEL: Record<string, string> = {
  medicare: "Medicare",
  commercial: "Commercial",
  "commercial-fallback": "Commercial (fallback)",
};

export const POLICY_GROUP_TITLE: Record<string, string> = {
  NCD: "National Coverage Determinations (NCD)",
  LCD: "Local Coverage Determinations (LCD)",
  LCA: "Local Coverage Articles (LCA)",
};

/** Pill tone + label for the "Prior Authorization Required" YES/NO/CONDITIONAL value. */
export function paRequiredPresentation(value?: string): {
  tone: Tone;
  label: string;
} {
  return {
    tone: value === "NO" ? "green" : "amber",
    label:
      value === "YES"
        ? "Required"
        : value === "NO"
          ? "Not required"
          : "Conditional",
  };
}

/**
 * Resolve a citation's source link. Prefers the agent-supplied URL; otherwise
 * builds the canonical CMS Medicare Coverage Database URL from the policy id
 * (LCD/LCA ids drop their letter prefix for the query param; NCD keeps its
 * dotted number).
 */
export function policySourceUrl(
  type?: string,
  policyId?: string,
  url?: string,
): string | undefined {
  if (url && /^https?:\/\//i.test(url.trim())) return url.trim();
  if (!policyId) return undefined;
  const id = policyId.trim();
  const num = id.replace(/^[A-Za-z]+/, "");
  const base = "https://www.cms.gov/medicare-coverage-database/view";
  if (type === "NCD") return `${base}/ncd.aspx?ncdid=${encodeURIComponent(id)}`;
  if (type === "LCD") return `${base}/lcd.aspx?lcdid=${encodeURIComponent(num)}`;
  if (type === "LCA")
    return `${base}/article.aspx?articleid=${encodeURIComponent(num)}`;
  return undefined;
}
