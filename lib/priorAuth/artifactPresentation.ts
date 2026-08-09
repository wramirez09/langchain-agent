import type { Determination } from "@/lib/priorAuth/artifactSchema";
import type {
  ArtifactReview,
  ReviewIssue,
  ReviewSeverity,
} from "@/lib/priorAuth/review/types";

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

// ---------------------------------------------------------------------------
// Review findings
// ---------------------------------------------------------------------------

export const REVIEW_SEVERITY_TONE: Record<ReviewSeverity, Tone> = {
  blocker: "red",
  warning: "amber",
  info: "blue",
};

/** Short chip text — the banner carries the full sentence. */
const ISSUE_CHIP_LABEL: Record<string, string> = {
  "schema-invalid": "Unexpected format",
  "section-missing": "Missing",
  "section-empty": "Empty",
  "section-not-applicable": "Not applicable",
  "field-required-by-context": "Expected here",
  "unknown-field": "Unrecognized",
  "code-not-in-evidence": "Not in sources",
  "code-evidence-unavailable": "Unverified",
  "code-source-out-of-scope": "Out of scope",
  "code-cited-as-non-covered": "Non-covered",
  "code-only-in-broader-source": "Broader source",
  "code-revision-not-requested": "Revision code",
  "repair-code-backfill": "From guideline",
};

export function issueChipLabel(issue: ReviewIssue): string {
  return ISSUE_CHIP_LABEL[issue.code] ?? "Check";
}

/**
 * Banner headline, or null when there is nothing to say.
 *
 * Returns null for an un-reviewed artifact too — messages written before the
 * gate shipped have no `review`, and claiming "checks passed" for them would
 * be a lie.
 */
export function reviewBannerSummary(review?: ArtifactReview): {
  tone: Tone;
  headline: string;
  counts: Record<ReviewSeverity, number>;
  clean: boolean;
  /** checks that did not run — the banner must not claim they passed */
  incomplete: number;
} | null {
  if (!review) return null;

  const counts: Record<ReviewSeverity, number> = { blocker: 0, warning: 0, info: 0 };
  for (const i of review.issues) counts[i.severity]++;

  // A check that was skipped or errored produces zero findings, which is not
  // the same thing as finding nothing. Grounding skips itself whenever there
  // is no usable evidence, so "no issues" is the *expected* output of a run
  // that checked nothing at all — and a green badge on that would be the one
  // lie this whole gate exists to prevent.
  const ran = review.checks.filter((c) => c.status === "ok").length;
  const incomplete = review.checks.filter((c) => c.status !== "ok").length;
  const defects = counts.blocker + counts.warning;

  if (defects === 0) {
    // `ran === 0` also covers a review carrying no checks at all, which must
    // never read as a pass — that is what an empty review looks like.
    if (incomplete > 0 || ran === 0) {
      return {
        tone: "neutral",
        headline:
          ran > 0
            ? "Some automated checks could not run"
            : "Automated checks could not run",
        counts,
        clean: false,
        incomplete,
      };
    }
    return {
      tone: "green",
      headline: "Automated checks passed",
      counts,
      clean: true,
      incomplete: 0,
    };
  }

  const noun = defects === 1 ? "item needs" : "items need";
  return {
    tone: counts.blocker > 0 ? "red" : "amber",
    headline: `${defects} ${noun} review`,
    counts,
    clean: false,
    incomplete,
  };
}

/** Plain-language reasons a check did not run, for the banner's detail list. */
const SKIP_REASONS: Record<string, string> = {
  "no-usable-evidence": "no sources were retrieved to check against",
  "evidence-truncated": "the retrieved sources were too large to check in full",
  "source-procedures-unavailable":
    "the sources could not say which procedures they cover",
  "request-has-no-content-tokens": "the request was too general to match against",
  "request-not-described":
    "the request did not describe the procedure being performed",
  "skip-condition-failed": "the check could not determine whether it applied",
};

export function skipReasonLabel(reason?: string): string {
  if (!reason) return "did not run";
  return SKIP_REASONS[reason] ?? reason;
}

const norm = (p: string) => p.replace(/\[(\d+)\]/g, ".$1");

/**
 * Findings attached to a path or anything beneath it, so a chip on
 * `relevantCodes.cpt[3]` also picks up one raised against
 * `relevantCodes.cpt[3].code`.
 */
export function issuesForPath(
  review: ArtifactReview | undefined,
  path: string,
): ReviewIssue[] {
  if (!review?.issues.length) return [];
  const want = norm(path);
  return review.issues.filter((i) => {
    const have = norm(i.path);
    return have === want || have.startsWith(`${want}.`);
  });
}

export function issuesForSection(
  review: ArtifactReview | undefined,
  sectionId: string,
): ReviewIssue[] {
  if (!review?.issues.length) return [];
  return review.issues.filter((i) => i.sectionId === sectionId);
}

/** Checks that could not run, phrased for the PDF's audit appendix. */
export function unrunChecks(
  review?: ArtifactReview,
): { id: string; status: string; reason?: string }[] {
  return (review?.checks ?? []).filter((c) => c.status !== "ok");
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
