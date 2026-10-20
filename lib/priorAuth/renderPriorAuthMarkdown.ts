import type {
  CoveragePolicy,
  Criterion,
  CriterionStatus,
  DocumentationGroup,
  LabeledCode,
  PriorAuthArtifact,
} from "@/lib/priorAuth/artifactSchema";
import type { ArtifactReview } from "@/lib/priorAuth/review/types";
import {
  DOC_ITEM_STATE_LABEL,
  GUIDELINE_LABEL,
  POLICY_GROUP_TITLE,
  REVIEW_SEVERITY_LABEL,
  determinationText,
  docItemState,
  issueChipLabel,
  paRequiredPresentation,
  policySourceUrl,
  reviewBannerSummary,
  reviewCheckLabel,
  skipReasonLabel,
  unrunChecks,
} from "@/lib/priorAuth/artifactPresentation";

/**
 * The whole prior-auth artifact as markdown.
 *
 * Two consumers that must agree byte for byte: the second text block of the
 * MCP `run_prior_auth_screening` result (what a host without MCP Apps shows
 * the model, and so the user) and the "Copy as markdown" button in the MCP
 * App view. It is a report for clinicians and billers, so nothing is
 * summarised or dropped — every criterion, sub-criterion, code, documentation
 * item, limitation and the disclaimer appear verbatim.
 *
 * Pure and dependency-free beyond type imports and presentation tables, so the
 * View bundle can import it without dragging in zod.
 */

export const CRITERION_STATUS_LABEL: Record<CriterionStatus, string> = {
  met: "Met",
  not_met: "Not met",
  unknown: "Unknown",
};

/** "2 of 6 met" — top-level criteria only, matching the web card. */
export function criteriaCounts(criteria: Criterion[]): {
  met: number;
  total: number;
} {
  return {
    met: criteria.filter((c) => c.status === "met").length,
    total: criteria.length,
  };
}

/**
 * "6 of 20 provided", plus how the rest split: `false` is missing from the
 * record, `null`/absent is not confirmed either way.
 */
export function documentationCounts(groups: DocumentationGroup[]): {
  provided: number;
  missing: number;
  unconfirmed: number;
  total: number;
} {
  const states = groups.flatMap((g) =>
    g.items.map((i) => docItemState(i.provided)),
  );
  return {
    provided: states.filter((s) => s === "provided").length,
    missing: states.filter((s) => s === "missing").length,
    unconfirmed: states.filter((s) => s === "unconfirmed").length,
    total: states.length,
  };
}

/** "6 of 20 provided · 10 missing · 4 not confirmed", omitting zero tails. */
export function documentationCountText(groups: DocumentationGroup[]): string {
  const c = documentationCounts(groups);
  return [
    `${c.provided} of ${c.total} provided`,
    c.missing ? `${c.missing} missing` : "",
    c.unconfirmed ? `${c.unconfirmed} not confirmed` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A submitted code inline: "73721 (MRI knee — note)". */
export function inlineCode(c: LabeledCode): string {
  return `${c.code} (${c.label}${c.note ? ` — ${c.note}` : ""})`;
}

/** Keep a value inside one table cell: no pipes, no line breaks. */
function cell(s: string): string {
  return s
    .replace(/\|/g, "\\|")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

function codeTable(codes: LabeledCode[]): string[] {
  if (codes.length === 0) return ["_None listed._"];
  return [
    "| Code | Description |",
    "| --- | --- |",
    ...codes.map(
      (c) =>
        `| ${cell(c.code)} | ${cell(c.label)}${c.note ? ` — _${cell(c.note)}_` : ""} |`,
    ),
  ];
}

function criterionLines(c: Criterion, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const lines = [
    `${indent}- **${c.title}** — ${CRITERION_STATUS_LABEL[c.status]}`,
  ];
  if (c.detail) lines.push(`${indent}  ${c.detail.replace(/\n+/g, " ")}`);
  for (const sub of c.subCriteria ?? []) {
    lines.push(...criterionLines(sub, depth + 1));
  }
  return lines;
}

function policyLines(p: CoveragePolicy): string[] {
  const lines = [`#### ${p.policyId ? `${p.policyId} — ` : ""}${p.title}`];
  if (p.contractor) lines.push(`- Contractor: ${p.contractor}`);
  if (p.jurisdiction) lines.push(`- Jurisdiction: ${p.jurisdiction}`);
  const url = policySourceUrl(p.type, p.policyId, p.url);
  if (url) lines.push(`- Source: ${url}`);
  if (p.summary) lines.push("", p.summary);
  if (p.criteria?.length) {
    lines.push("");
    for (const c of p.criteria) lines.push(...criterionLines(c, 0));
  }
  return lines;
}

function reviewLines(review: ArtifactReview): string[] {
  const summary = reviewBannerSummary(review);
  if (!summary) return [];
  const lines = [`**${summary.headline}**`, ""];
  for (const i of review.issues) {
    lines.push(
      `- **${REVIEW_SEVERITY_LABEL[i.severity]}** · ${i.label} — ${i.message} _(${issueChipLabel(i)})_`,
    );
  }
  if (review.omittedCount) {
    lines.push(`- …and ${review.omittedCount} more not shown.`);
  }
  for (const c of unrunChecks(review)) {
    const verb = c.status === "partial" ? "Partly checked" : "Not checked";
    lines.push(
      `- ${verb} — ${reviewCheckLabel(c.id)}: ${skipReasonLabel(c.reason)}.`,
    );
  }
  if (review.repairs.length) {
    const n = review.repairs.length;
    lines.push(
      `- ${n} ${n === 1 ? "field was" : "fields were"} filled from the guideline before the checks ran.`,
    );
  }
  return lines;
}

function bullets(items: string[], empty: string): string[] {
  return items.length ? items.map((i) => `- ${i}`) : [`_${empty}_`];
}

export function renderPriorAuthMarkdown(a: PriorAuthArtifact): string {
  const o = a.requestOverview;
  const out: string[] = [];
  const section = (title: string, body: string[]) =>
    out.push("", `## ${title}`, "", ...body);

  out.push(`# ${a.title}`, "");
  out.push(
    `**Guideline basis:** ${GUIDELINE_LABEL[a.guidelineBasis] ?? a.guidelineBasis}  `,
    `**Determination:** ${determinationText(a.summary)}`,
  );
  if (a.phiNotice) out.push("", `> ${a.phiNotice}`);
  if (a.fallbackNotice) out.push("", `> ${a.fallbackNotice}`);

  section("Determination", [a.summary.rationale]);

  const overview = [`- **Treatment:** ${o.treatment}`];
  if (o.diagnosis) overview.push(`- **Diagnosis:** ${o.diagnosis}`);
  overview.push(
    `- **Submitted CPT/HCPCS:** ${o.cpt.length ? o.cpt.map(inlineCode).join("; ") : "Not provided"}`,
    `- **Submitted ICD-10:** ${o.icd10.length ? o.icd10.map(inlineCode).join("; ") : "Not provided"}`,
    `- **Medical history:** ${o.medicalHistory || "Not provided"}`,
  );
  if (o.suggestedCpt?.length) {
    overview.push(
      "",
      "**Likely CPT/HCPCS options:**",
      "",
      ...codeTable(o.suggestedCpt),
    );
  }
  if (o.suggestedIcd10?.length) {
    overview.push(
      "",
      "**Likely ICD-10 options:**",
      "",
      ...codeTable(o.suggestedIcd10),
    );
  }
  if (o.suggestedCodesNote) overview.push("", `_${o.suggestedCodesNote}_`);
  overview.push(
    "",
    "**Key findings:**",
    ...bullets(o.keyFindings, "None listed."),
  );
  section("Request overview", overview);

  section("Prior authorization required", [
    `**Status:** ${paRequiredPresentation(a.priorAuthRequired).label}`,
    ...(a.priorAuthRationale ? ["", a.priorAuthRationale] : []),
  ]);

  if (a.medicarePolicies?.length) {
    const body: string[] = [];
    for (const type of ["NCD", "LCD", "LCA"] as const) {
      const group = a.medicarePolicies.filter((p) => p.type === type);
      if (!group.length) continue;
      body.push(`### ${POLICY_GROUP_TITLE[type]}`, "");
      for (const p of group) body.push(...policyLines(p), "");
    }
    section("Medicare coverage policies", body);
  }

  const cc = criteriaCounts(a.medicalNecessityCriteria);
  section("Medical necessity criteria", [
    `${cc.met} of ${cc.total} met`,
    "",
    ...(a.medicalNecessityCriteria.length
      ? a.medicalNecessityCriteria.flatMap((c) => criterionLines(c, 0))
      : ["_None listed._"]),
  ]);

  const codes = ["### CPT/HCPCS", "", ...codeTable(a.relevantCodes.cpt)];
  if (a.relevantCodes.cptNote) codes.push("", `_${a.relevantCodes.cptNote}_`);
  codes.push("", "### ICD-10", "", ...codeTable(a.relevantCodes.icd10));
  if (a.relevantCodes.icd10Note)
    codes.push("", `_${a.relevantCodes.icd10Note}_`);
  section("Codes", codes);

  const docs = [documentationCountText(a.requiredDocumentation)];
  for (const g of a.requiredDocumentation) {
    docs.push("");
    if (g.title) docs.push(`### ${g.title}`, "");
    for (const i of g.items) {
      const state = docItemState(i.provided);
      const label = DOC_ITEM_STATE_LABEL[state];
      docs.push(
        state === "provided"
          ? `- [x] ${i.item} — ${label}`
          : state === "missing"
            ? `- [ ] ${i.item} — **${label}**`
            : `- [ ] ${i.item} — _${label}_`,
      );
    }
  }
  section("Required documentation", docs);

  if (a.review) section("Automated review", reviewLines(a.review));

  section("Limitations", bullets(a.limitations, "None listed."));
  section("Missing items", bullets(a.summary.missingItems, "None listed."));
  section("Disclaimer", [a.disclaimer]);

  return (
    out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}
