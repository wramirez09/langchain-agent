import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  Svg,
  Path,
  Circle,
  StyleSheet,
} from "@react-pdf/renderer";
import type {
  PartialPriorAuthArtifact,
  Criterion,
  LabeledCode,
  CoveragePolicy,
  Determination,
  DeepPartial,
} from "@/lib/priorAuth/artifactSchema";
import {
  type Tone,
  DETERMINATION_TONE,
  GUIDELINE_LABEL,
  POLICY_GROUP_TITLE,
  REVIEW_SEVERITY_TONE,
  issueChipLabel,
  issuesForPath,
  paRequiredPresentation,
  policySourceUrl,
  reviewBannerSummary,
  skipReasonLabel,
  unrunChecks,
} from "@/lib/priorAuth/artifactPresentation";
import type { ArtifactReview, ReviewIssue } from "@/lib/priorAuth/review/types";
import {
  ARTIFACT_SECTIONS,
  has,
  type ArtifactSectionId,
} from "@/lib/priorAuth/artifactSections";
import { logoBase64 } from "./logo";
import {
  pdfSectionTitleColor,
  pdfSectionIndexColor,
  pdfRingColors,
} from "./pdfTheme";

type P<T> = DeepPartial<T>;

/**
 * High-fidelity PDF rendering of the prior-auth artifact — mirrors the web
 * renderer (components/prior-auth/artifact/ArtifactSections.tsx): same design
 * tokens, same section order, same dynamic numbering of present sections.
 * Tolerates a partial artifact the same way the web renderer does.
 */

// Design tokens (NoteDoctor design handoff) keyed by shared Tone.
const TONE: Record<Tone, { bg: string; border: string; text: string; dot: string }> = {
  green: { bg: "#edfcf2", border: "#bbf0cb", text: "#15803d", dot: "#15803d" },
  amber: { bg: "#fff8ec", border: "#f7e0b0", text: "#b45309", dot: "#d97706" },
  red: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", dot: "#b91c1c" },
  blue: { bg: "#eff4ff", border: "#dbe6fe", text: "#238dd2", dot: "#238dd2" },
  neutral: { bg: "#ffffff", border: "#e6eaf2", text: "#475569", dot: "#94a3b8" },
};

const INK = "#0f172a";
const BODY = "#283142";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const CARD_BORDER = "#e6eaf2";
const DIVIDER = "#edf0f6";
const SUBCARD_BG = "#f8fafc";
const SUBCARD_BORDER = "#eef1f7";
const BLUE = "#238dd2";
const BLUE_DARK = "#238dd2";

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    padding: 36,
    paddingBottom: 56,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: BODY,
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    width: 22,
    height: "auto",
    marginRight: 8,
  },
  brandName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  brandDate: {
    marginLeft: "auto",
    fontSize: 7.5,
    color: FAINT,
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textAlign: "center",
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 4,
  },
  notice: {
    fontSize: 7.5,
    color: FAINT,
    marginTop: 4,
  },
  fallbackNotice: {
    marginTop: 6,
    backgroundColor: TONE.amber.bg,
    borderWidth: 1,
    borderColor: TONE.amber.border,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 8,
    color: TONE.amber.text,
  },
  // Same box as fallbackNotice; the tone colours are applied per-render.
  reviewBanner: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  reviewBannerTitle: { fontSize: 8, fontWeight: 700 },
  reviewBannerItem: { fontSize: 7.5, marginTop: 2 },
  issueChip: { fontSize: 7.5, fontWeight: 700 },
  auditRow: { fontSize: 8, marginTop: 3, color: MUTED },
  card: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  cardTitleIndex: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    marginRight: 6,
  },
  cardTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 5,
    marginBottom: 3,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginRight: 4,
  },
  pillText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  chipText: {
    fontSize: 8,
    color: MUTED,
  },
  chipTextStrong: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  codeChip: {
    alignSelf: "flex-start",
    backgroundColor: TONE.blue.bg,
    borderWidth: 1,
    borderColor: TONE.blue.border,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  codeChipText: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: BLUE_DARK,
  },
  fieldRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  fieldHalf: {
    width: "50%",
    paddingRight: 10,
  },
  fieldFull: {
    width: "100%",
  },
  fieldLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 9.5,
    color: INK,
    lineHeight: 1.5,
  },
  fieldValueNa: {
    fontSize: 9.5,
    color: FAINT,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
    marginVertical: 10,
  },
  subHeading: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 5,
  },
  groupHeading: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.6,
    color: BODY,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  bulletRing: {
    width: 6,
    height: 6,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: pdfRingColors("blue").border,
    backgroundColor: pdfRingColors("blue").background,
    marginTop: 3,
    marginRight: 8,
  },
  bulletRingDanger: {
    width: 6,
    height: 6,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: pdfRingColors("danger").border,
    backgroundColor: pdfRingColors("danger").background,
    marginTop: 3,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 1.5,
    color: BODY,
  },
  criterionTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  criterionTitleChild: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  criterionDetail: {
    fontSize: 9,
    lineHeight: 1.5,
    color: MUTED,
    marginTop: 2,
  },
  subCriteria: {
    borderLeftWidth: 2,
    borderLeftColor: SUBCARD_BORDER,
    paddingLeft: 10,
    marginLeft: 1,
    marginTop: 5,
  },
  policyBlock: {
    backgroundColor: SUBCARD_BG,
    borderWidth: 1,
    borderColor: SUBCARD_BORDER,
    borderRadius: 8,
    padding: 9,
    marginBottom: 7,
  },
  policyHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  policyTitle: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1.4,
  },
  policyMeta: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 2,
  },
  policySummary: {
    fontSize: 9,
    lineHeight: 1.55,
    color: BODY,
    marginTop: 3,
  },
  policyLink: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    marginTop: 5,
    textDecoration: "none",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    paddingBottom: 5,
  },
  tableHeaderCode: {
    width: 64,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: FAINT,
    letterSpacing: 0.8,
  },
  tableHeaderDesc: {
    flex: 1,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: FAINT,
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: DIVIDER,
    paddingVertical: 6,
  },
  tableCellCode: {
    width: 64,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  tableCellDesc: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.5,
    color: BODY,
  },
  tableCellNote: {
    color: FAINT,
  },
  tableNote: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.55,
    color: MUTED,
    marginTop: 5,
  },
  notProvided: {
    fontSize: 9,
    color: FAINT,
  },
  checklistRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  checkbox: {
    width: 9,
    height: 9,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    marginTop: 1.5,
    marginRight: 7,
  },
  checkboxChecked: {
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: TONE.green.text,
    marginTop: 1.5,
    marginRight: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.5,
    color: BODY,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 6,
  },
  blueCheckRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  blueCheckText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 1.5,
    color: BODY,
    marginLeft: 7,
  },
  disclaimerText: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.55,
    color: FAINT,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  infoBox: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: TONE.blue.border,
    backgroundColor: TONE.blue.bg,
    borderRadius: 8,
    padding: 9,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.55,
    color: BLUE_DARK,
    marginLeft: 7,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: CARD_BORDER,
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7.5,
    color: FAINT,
  },
});

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function Pill({ tone, label }: { tone: Tone; label: string }) {
  const t = TONE[tone];
  return (
    <View
      wrap={false}
      style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}
    >
      <View style={[styles.pillDot, { backgroundColor: t.dot }]} />
      <Text style={[styles.pillText, { color: t.text }]}>{label}</Text>
    </View>
  );
}

/**
 * The review summary, mirroring the web banner. Always expanded: paper has no
 * disclosure control, and a printed report that hides its own caveats is
 * exactly the failure this whole gate exists to prevent.
 */
function ReviewBannerPdf({ review }: { review?: ArtifactReview }) {
  const summary = reviewBannerSummary(review);
  if (!summary || !review) return null;
  const t = TONE[summary.tone];

  return (
    <View
      style={[
        styles.reviewBanner,
        { backgroundColor: t.bg, borderColor: t.border },
      ]}
    >
      <Text style={[styles.reviewBannerTitle, { color: t.text }]}>
        {summary.headline}
      </Text>
      {review.issues.map((issue, i) => (
        <Text
          key={`${issue.path}-${i}`}
          style={[styles.reviewBannerItem, { color: t.text }]}
        >
          • {issue.label} — {issue.message}
        </Text>
      ))}
      {review.omittedCount ? (
        <Text style={[styles.reviewBannerItem, { color: t.text }]}>
          • …and {review.omittedCount} more not shown.
        </Text>
      ) : null}
      {unrunChecks(review).map((c) => (
        <Text key={c.id} style={[styles.reviewBannerItem, { color: t.text }]}>
          • Not checked — {c.id === "code-grounding" ? "code sources" : "report structure"}
          : {skipReasonLabel(c.reason)}.
        </Text>
      ))}
    </View>
  );
}

/**
 * What the checks could not evaluate.
 *
 * PDF-only, and the reason it exists: this file is the compliance record. "The
 * scoping check did not run because the sources could not supply procedure
 * lists" is a materially different statement from "scoping found nothing", and
 * a reader holding a printout has no server log to consult.
 */
function AuditAppendix({ review }: { review?: ArtifactReview }) {
  const unrun = unrunChecks(review);
  if (!review || unrun.length === 0) return null;

  return (
    <SectionCard title="Automated Checks">
      {review.checks.map((c) => (
        <Text key={c.id} style={styles.auditRow}>
          {c.id}: {c.status}
          {c.reason ? ` (${c.reason})` : ""}
          {c.status === "ok" ? ` — ${c.issueCount} finding(s)` : ""}
        </Text>
      ))}
    </SectionCard>
  );
}

/** Inline marker on a value the automated checks flagged. */
function IssueChipPdf({ issues }: { issues: ReviewIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <>
      {issues.map((issue, i) => {
        const t = TONE[REVIEW_SEVERITY_TONE[issue.severity]];
        return (
          <Text key={`${issue.code}-${i}`} style={[styles.issueChip, { color: t.text }]}>
            {" "}
            [{issueChipLabel(issue)}]
          </Text>
        );
      })}
    </>
  );
}

/** Neutral "Guidelines **Medicare**" / "CPT **73721**" header chip. */
function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <View
      wrap={false}
      style={[
        styles.pill,
        { backgroundColor: "#ffffff", borderColor: CARD_BORDER },
      ]}
    >
      <Text style={styles.chipText}>
        {label} <Text style={styles.chipTextStrong}>{value}</Text>
      </Text>
    </View>
  );
}

function CodeChip({ code }: { code?: string }) {
  return (
    <View style={styles.codeChip}>
      <Text style={styles.codeChipText}>{code}</Text>
    </View>
  );
}

function SectionCard({
  index,
  title,
  blue,
  danger,
  success,
  children,
}: {
  index?: number;
  title: string;
  blue?: boolean;
  danger?: boolean;
  success?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, blue ? { borderColor: TONE.blue.border } : {}]}>
      <View style={styles.cardTitleRow} minPresenceAhead={40}>
        {index != null ? (
          <Text
            style={[
              styles.cardTitleIndex,
              { color: pdfSectionIndexColor({ danger, success }) },
            ]}
          >
            {String(index).padStart(2, "0")}
          </Text>
        ) : null}
        <Text
          style={[
            styles.cardTitle,
            { color: pdfSectionTitleColor({ danger, success }) },
          ]}
        >
          {title.toUpperCase()}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Field({
  k,
  v,
  full,
  na,
}: {
  k: string;
  v: string;
  full?: boolean;
  na?: boolean;
}) {
  return (
    <View style={full ? styles.fieldFull : styles.fieldHalf}>
      <Text style={styles.fieldLabel}>{k}</Text>
      <Text style={na ? styles.fieldValueNa : styles.fieldValue}>{v}</Text>
    </View>
  );
}

/** Ring-bullet list (key findings, limitations). Defaults to blue rings; `tone="danger"` renders red rings to match the danger header. */
function RingBulletList({
  items,
  tone = "blue",
}: {
  items?: (string | undefined)[];
  tone?: "blue" | "danger";
}) {
  const list = (items ?? []).filter(Boolean);
  const ringStyle =
    tone === "danger" ? styles.bulletRingDanger : styles.bulletRing;
  return (
    <View>
      {list.map((t, i) => (
        <View key={i} style={styles.bulletRow} wrap={false}>
          <View style={ringStyle} />
          <Text style={styles.bulletText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

const WhiteCheck = (
  <Svg viewBox="0 0 10 10" width={7} height={7}>
    <Path
      d="M2.2 5.3l2 2 3.6-4.2"
      stroke="#ffffff"
      strokeWidth={1.4}
      fill="none"
    />
  </Svg>
);

const BlueCheckCircle = (
  <Svg viewBox="0 0 20 20" width={11} height={11}>
    <Circle cx={10} cy={10} r={9} fill={TONE.blue.bg} stroke={TONE.blue.border} />
    <Path
      d="M6.4 10.3l2.4 2.4L13.8 7.6"
      stroke={BLUE}
      strokeWidth={1.5}
      fill="none"
    />
  </Svg>
);

const WarningIcon = (
  <Svg viewBox="0 0 24 24" width={11} height={11}>
    <Path
      d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.74A2 2 0 0 0 3.53 22h16.94a2 2 0 0 0 1.73-3.4L13.7 3.86a2 2 0 0 0-3.4 0z"
      stroke={BLUE_DARK}
      strokeWidth={1.5}
      fill="none"
    />
  </Svg>
);

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function PdfTitleBlock({
  data,
}: {
  data: PartialPriorAuthArtifact;
}) {
  const det = data.summary?.determination as Determination | undefined;
  const detLabel = data.summary?.determinationLabel;
  const primaryCpt =
    data.requestOverview?.cpt?.[0]?.code ??
    data.requestOverview?.suggestedCpt?.[0]?.code;

  return (
    <View style={{ marginBottom: 14 }}>
      {data.title ? <Text style={styles.title}>{data.title}</Text> : null}
      <View style={styles.pillRow}>
        {detLabel && det ? (
          <Pill tone={DETERMINATION_TONE[det] ?? "amber"} label={detLabel} />
        ) : null}
        {data.guidelineBasis ? (
          <HeaderChip
            label="Guidelines"
            value={GUIDELINE_LABEL[data.guidelineBasis] ?? data.guidelineBasis}
          />
        ) : null}
        {primaryCpt ? <HeaderChip label="CPT" value={primaryCpt} /> : null}
      </View>
      {data.phiNotice ? (
        <Text style={styles.notice}>{data.phiNotice}</Text>
      ) : null}
      {data.fallbackNotice ? (
        <Text style={styles.fallbackNotice}>{data.fallbackNotice}</Text>
      ) : null}
      <ReviewBannerPdf review={data.review as ArtifactReview | undefined} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 01 Request Overview
// ---------------------------------------------------------------------------

function OptCol({
  heading,
  codes,
  review,
  basePath,
}: {
  heading: string;
  codes?: P<LabeledCode>[];
  review?: ArtifactReview;
  basePath?: string;
}) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <View style={styles.fieldHalf}>
      <Text style={[styles.fieldLabel, { marginBottom: 5 }]}>{heading}</Text>
      {list.map((c, i) => (
        <View
          key={i}
          wrap={false}
          style={{ flexDirection: "row", marginBottom: 5 }}
        >
          <CodeChip code={c?.code} />
          <Text style={[styles.bulletText, { marginLeft: 6 }]}>
            {c?.label}
            {basePath ? (
              <IssueChipPdf issues={issuesForPath(review, `${basePath}[${i}]`)} />
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RequestOverviewSection({
  index,
  ov,
  review,
}: {
  index: number;
  ov: PartialPriorAuthArtifact["requestOverview"];
  review?: ArtifactReview;
}) {
  if (!ov) return null;
  const codeText = (codes?: P<LabeledCode>[]) =>
    (codes ?? [])
      .filter(Boolean)
      .map((c) => c?.code)
      .join(", ");
  const hasSuggested =
    (ov.suggestedCpt?.length ?? 0) > 0 || (ov.suggestedIcd10?.length ?? 0) > 0;
  return (
    <SectionCard index={index} title="Request Overview">
      {ov.treatment ? <View style={styles.fieldRow}><Field full k="Treatment" v={ov.treatment} /></View> : null}
      {ov.diagnosis ? <View style={styles.fieldRow}><Field full k="Diagnosis" v={ov.diagnosis} /></View> : null}
      <View style={styles.fieldRow}>
        <Field
          k="CPT / HCPCS"
          v={codeText(ov.cpt) || "Not provided"}
          na={!codeText(ov.cpt)}
        />
        <Field
          k="ICD-10"
          v={codeText(ov.icd10) || "Not provided"}
          na={!codeText(ov.icd10)}
        />
      </View>
      {hasSuggested ? (
        <>
          <View style={styles.divider} />
          <View style={{ flexDirection: "row" }}>
            <OptCol
              heading="Likely CPT / HCPCS options"
              codes={ov.suggestedCpt}
              review={review}
              basePath="requestOverview.suggestedCpt"
            />
            <OptCol
              heading="Likely ICD-10 options"
              codes={ov.suggestedIcd10}
              review={review}
              basePath="requestOverview.suggestedIcd10"
            />
          </View>
          {ov.suggestedCodesNote ? (
            <Text style={styles.tableNote}>{ov.suggestedCodesNote}</Text>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 02 Clinical Context
// ---------------------------------------------------------------------------

function ClinicalContextSection({
  index,
  ov,
}: {
  index: number;
  ov: PartialPriorAuthArtifact["requestOverview"];
}) {
  if (!ov?.medicalHistory && !(ov?.keyFindings?.length ?? 0)) return null;
  return (
    <SectionCard index={index} title="Clinical Context">
      {ov?.medicalHistory ? (
        <>
          <Text style={styles.subHeading}>Medical History</Text>
          <Text style={styles.paragraph}>{ov.medicalHistory}</Text>
        </>
      ) : null}
      {ov?.keyFindings && ov.keyFindings.length > 0 ? (
        <>
          <Text style={[styles.subHeading, { marginTop: 10 }]}>
            Key Clinical Findings
          </Text>
          <RingBulletList items={ov.keyFindings} />
        </>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 03 Prior Authorization Required
// ---------------------------------------------------------------------------

function PaRequiredSection({
  index,
  value,
  rationale,
}: {
  index: number;
  value?: string;
  rationale?: string;
}) {
  const { tone, label } = paRequiredPresentation(value);
  return (
    <SectionCard index={index} title="Prior Authorization Required">
      <View style={{ marginBottom: rationale ? 6 : 0 }}>
        <Pill tone={tone} label={label} />
      </View>
      {rationale ? <Text style={styles.paragraph}>{rationale}</Text> : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Medicare coverage (NCD / LCD / LCA)
// ---------------------------------------------------------------------------

function CitationChip({
  type,
  id,
  href,
}: {
  type?: string;
  id: string;
  href?: string;
}) {
  const chip = (
    <View style={[styles.codeChip, { marginRight: 6 }]}>
      <Text style={styles.codeChipText}>{type ? `${type} ${id}` : id}</Text>
    </View>
  );
  if (!href) return chip;
  return <Link src={href} style={{ textDecoration: "none" }}>{chip}</Link>;
}

function PolicyBlock({ p }: { p?: P<CoveragePolicy> }) {
  if (!p) return null;
  const src = policySourceUrl(p.type, p.policyId, p.url);
  const meta = [p.contractor, p.jurisdiction].filter(Boolean).join(" · ");
  return (
    <View style={styles.policyBlock}>
      <View style={styles.policyHeaderRow} wrap={false}>
        {p.policyId ? (
          <CitationChip type={p.type} id={p.policyId} href={src} />
        ) : null}
        <Text style={styles.policyTitle}>{p.title}</Text>
      </View>
      {meta ? <Text style={styles.policyMeta}>{meta}</Text> : null}
      {p.summary ? <Text style={styles.policySummary}>{p.summary}</Text> : null}
      {p.criteria && p.criteria.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          {p.criteria.map((c, i) => (
            <View key={i} style={{ marginBottom: 5 }}>
              <CriterionBlock c={c} child />
            </View>
          ))}
        </View>
      ) : null}
      {src ? (
        <Link src={src} style={styles.policyLink}>
          View on CMS Medicare Coverage Database
        </Link>
      ) : null}
    </View>
  );
}

function MedicarePoliciesSection({
  index,
  policies,
}: {
  index: number;
  policies?: P<CoveragePolicy>[];
}) {
  const list = (policies ?? []).filter(Boolean);
  if (list.length === 0) return null;
  const order: Array<"NCD" | "LCD" | "LCA"> = ["NCD", "LCD", "LCA"];
  return (
    <SectionCard index={index} title="Medicare Coverage">
      {order.map((type) => {
        const group = list.filter((p) => p?.type === type);
        if (group.length === 0) return null;
        return (
          <View key={type} style={{ marginBottom: 6 }}>
            <Text style={styles.groupHeading}>
              {POLICY_GROUP_TITLE[type].toUpperCase()}
            </Text>
            {group.map((p, i) => (
              <PolicyBlock key={i} p={p} />
            ))}
          </View>
        );
      })}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 04 Medical Necessity Criteria
// ---------------------------------------------------------------------------

function CriterionBlock({ c, child }: { c?: P<Criterion>; child?: boolean }) {
  if (!c) return null;
  return (
    <View>
      <Text style={child ? styles.criterionTitleChild : styles.criterionTitle}>
        {c.title}
      </Text>
      {c.detail ? (
        <Text style={styles.criterionDetail}>{c.detail}</Text>
      ) : null}
      {c.subCriteria && c.subCriteria.length > 0 ? (
        <View style={styles.subCriteria}>
          {c.subCriteria.map((sc, i) => (
            <View key={i} style={{ marginBottom: 5 }}>
              <CriterionBlock c={sc} child />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CriteriaSection({
  index,
  criteria,
}: {
  index: number;
  criteria?: P<Criterion>[];
}) {
  const list = (criteria ?? []).filter(Boolean);
  return (
    <SectionCard index={index} title="Medical Necessity Criteria">
      {list.map((c, i) => (
        <View
          key={i}
          style={
            i === 0
              ? { paddingBottom: 8 }
              : {
                borderTopWidth: 1,
                borderTopColor: DIVIDER,
                paddingTop: 8,
                paddingBottom: 8,
              }
          }
        >
          <CriterionBlock c={c} />
        </View>
      ))}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 05 Relevant Codes
// ---------------------------------------------------------------------------

function CodeTable({
  codes,
  review,
  basePath,
}: {
  codes?: P<LabeledCode>[];
  review?: ArtifactReview;
  /** artifact path of this list, so findings can be matched per row */
  basePath?: string;
}) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0) {
    return <Text style={styles.notProvided}>Not provided</Text>;
  }
  return (
    <View>
      <View style={styles.tableHeaderRow} wrap={false} minPresenceAhead={24}>
        <Text style={styles.tableHeaderCode}>CODE</Text>
        <Text style={styles.tableHeaderDesc}>DESCRIPTION</Text>
      </View>
      {list.map((c, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          <Text style={styles.tableCellCode}>{c?.code}</Text>
          <Text style={styles.tableCellDesc}>
            {c?.label}
            {c?.note ? (
              <Text style={styles.tableCellNote}> ({c.note})</Text>
            ) : null}
            {basePath ? (
              <IssueChipPdf issues={issuesForPath(review, `${basePath}[${i}]`)} />
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CodesSection({
  index,
  codes,
  review,
}: {
  index: number;
  codes?: PartialPriorAuthArtifact["relevantCodes"];
  review?: ArtifactReview;
}) {
  if (!codes) return null;
  return (
    <SectionCard index={index} title="Relevant Codes">
      <Text style={styles.groupHeading}>ICD-10</Text>
      <CodeTable
        codes={codes.icd10}
        review={review}
        basePath="relevantCodes.icd10"
      />
      {codes.icd10Note ? (
        <Text style={styles.tableNote}>{codes.icd10Note}</Text>
      ) : null}
      <Text style={[styles.groupHeading, { marginTop: 12 }]}>CPT / HCPCS</Text>
      <CodeTable codes={codes.cpt} review={review} basePath="relevantCodes.cpt" />
      {codes.cptNote ? (
        <Text style={styles.tableNote}>{codes.cptNote}</Text>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 06 Required Documentation
// ---------------------------------------------------------------------------

function ChecklistItem({
  item,
  provided,
}: {
  item?: string;
  provided?: boolean | null;
}) {
  return (
    <View style={styles.checklistRow} wrap={false}>
      {provided === true ? (
        <View style={styles.checkboxChecked}>{WhiteCheck}</View>
      ) : (
        <View style={styles.checkbox} />
      )}
      <Text style={styles.checklistText}>{item}</Text>
    </View>
  );
}

function DocumentationSection({
  index,
  groups,
}: {
  index: number;
  groups?: PartialPriorAuthArtifact["requiredDocumentation"];
}) {
  const list = (groups ?? []).filter(Boolean);
  return (
    <SectionCard index={index} title="Required Documentation" success>
      {list.map((g, gi) => {
        const items = (g?.items ?? []).filter(Boolean);
        return (
          <View key={gi} style={{ marginBottom: 8 }}>
            {g?.title ? (
              <Text style={styles.subHeading}>{g.title}</Text>
            ) : null}
            {items.map((d, i) => (
              <ChecklistItem key={i} item={d?.item} provided={d?.provided} />
            ))}
          </View>
        );
      })}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 07 Limitations · 08 Summary · Disclaimer
// ---------------------------------------------------------------------------

function SummarySection({
  index,
  summary,
}: {
  index: number;
  summary: PartialPriorAuthArtifact["summary"];
}) {
  if (!summary) return null;
  const strengthen = (summary.missingItems ?? []).filter(Boolean);
  return (
    <SectionCard index={index} title="Summary" blue>
      {summary.determinationLabel ? (
        <Text style={styles.summaryLabel}>{summary.determinationLabel}</Text>
      ) : null}
      {summary.rationale ? (
        <Text style={styles.paragraph}>{summary.rationale}</Text>
      ) : null}
      {strengthen.length > 0 ? (
        <>
          <Text style={[styles.subHeading, { marginTop: 10 }]}>
            To strengthen the request
          </Text>
          {strengthen.map((t, i) => (
            <View key={i} style={styles.blueCheckRow} wrap={false}>
              {BlueCheckCircle}
              <Text style={styles.blueCheckText}>{t}</Text>
            </View>
          ))}
        </>
      ) : null}
    </SectionCard>
  );
}

function DisclaimerBlock({ disclaimer }: { disclaimer?: string }) {
  return (
    <View>
      {disclaimer ? (
        <Text style={styles.disclaimerText}>{disclaimer}</Text>
      ) : null}
      <View style={styles.infoBox} wrap={false}>
        {WarningIcon}
        <Text style={styles.infoBoxText}>
          Always verify with payer portal guidelines prior to submission. This
          analysis is based on publicly available information.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

interface ArtifactPdfDocumentProps {
  artifact: PartialPriorAuthArtifact;
  /** preformatted date string, computed by the caller at export time */
  generatedAt: string;
}

const ArtifactPdfDocument: React.FC<ArtifactPdfDocumentProps> = ({
  artifact: data,
  generatedAt,
}) => {
  // Order, ids, and presence conditions come from the shared manifest, so PDF
  // numbering matches the on-screen document by construction rather than by
  // keeping two hand-written lists in agreement.
  const renderers: Record<ArtifactSectionId, (i: number) => React.ReactNode> = {
    overview: (i) => (
      <RequestOverviewSection
        key="overview"
        index={i}
        ov={data.requestOverview}
        review={data.review as ArtifactReview | undefined}
      />
    ),
    context: (i) => (
      <ClinicalContextSection key="context" index={i} ov={data.requestOverview} />
    ),
    authorization: (i) => (
      <PaRequiredSection
        key="authorization"
        index={i}
        value={data.priorAuthRequired}
        rationale={data.priorAuthRationale}
      />
    ),
    medicare: (i) => (
      <MedicarePoliciesSection
        key="medicare"
        index={i}
        policies={data.medicarePolicies}
      />
    ),
    criteria: (i) => (
      <CriteriaSection
        key="criteria"
        index={i}
        criteria={data.medicalNecessityCriteria}
      />
    ),
    codes: (i) => (
      <CodesSection
        key="codes"
        index={i}
        codes={data.relevantCodes}
        review={data.review as ArtifactReview | undefined}
      />
    ),
    documentation: (i) => (
      <DocumentationSection
        key="documentation"
        index={i}
        groups={data.requiredDocumentation}
      />
    ),
    limitations: (i) => (
      <SectionCard key="limitations" index={i} title="Limitations & Exclusions" danger>
        <RingBulletList items={data.limitations} tone="danger" />
      </SectionCard>
    ),
    summary: (i) => <SummarySection key="summary" index={i} summary={data.summary} />,
  };

  const sections = ARTIFACT_SECTIONS.filter((s) => s.present(data)).map(
    (s) => renderers[s.id],
  );

  return (
    <Document title={data.title ?? "Prior Authorization Summary"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandHeader}>
          <Image src={logoBase64} style={styles.logo} cache={false} />
          <Text style={styles.brandName}>NoteDoctorAI</Text>
          <Text style={styles.brandDate}>Generated {generatedAt}</Text>
        </View>

        <PdfTitleBlock data={data} />

        {sections.map((render, i) => render(i + 1))}

        <AuditAppendix review={data.review as ArtifactReview | undefined} />

        {has(data.disclaimer) ? (
          <DisclaimerBlock disclaimer={data.disclaimer} />
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>NoteDoctorAi· Prior Authorization Summary</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
};

export default ArtifactPdfDocument;
