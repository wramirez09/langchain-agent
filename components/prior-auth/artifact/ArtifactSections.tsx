"use client";

import React from "react";
import { cn } from "@/utils/cn";
import type {
  PartialPriorAuthArtifact,
  Criterion,
  CriterionStatus,
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
} from "@/lib/priorAuth/artifactPresentation";
import type { ArtifactReview, ReviewIssue } from "@/lib/priorAuth/review/types";
import { docItemKey } from "@/lib/priorAuth/docChecks";
import { useOptionalPriorAuthDocChecks } from "@/components/providers/PriorAuthProvider";

type P<T> = DeepPartial<T>;

// ---------------------------------------------------------------------------
// Review findings
// ---------------------------------------------------------------------------

/**
 * The cards take indexed-access props (`PartialPriorAuthArtifact["x"]`), so the
 * review would otherwise have to be threaded through nine components to reach
 * the one row it belongs on. Context keeps the prop signatures untouched.
 *
 * Defaults to undefined, so a card rendered outside a provider — or an artifact
 * from before the gate shipped — simply shows nothing.
 */
const ReviewContext = React.createContext<ArtifactReview | undefined>(undefined);

export function ArtifactReviewProvider({
  review,
  children,
}: {
  review?: ArtifactReview;
  children: React.ReactNode;
}) {
  return <ReviewContext.Provider value={review}>{children}</ReviewContext.Provider>;
}

/** Findings on a path or anything under it. */
function useIssues(path?: string): ReviewIssue[] {
  const review = React.useContext(ReviewContext);
  return path ? issuesForPath(review, path) : [];
}

// Design tokens (from the NoteDoctor design handoff) as exact Tailwind
// arbitrary values so the React render matches the prototype.
const CARD =
  "rounded-[14px] border border-border bg-card p-5 sm:p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_28px_-18px_rgba(16,24,40,0.18)]";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SectionCard({
  id,
  index,
  title,
  blue,
  children,
  theme = "neutral",
}: {
  id?: string;
  index?: number;
  title: string;
  blue?: boolean;
  children: React.ReactNode;
  theme?: string;
}) {
  return (
    <section id={id} className={cn(CARD, blue && "border-primary/20", "scroll-mt-4")}>
      <h3 className={`mb-[18px] flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.09em] ${theme === "danger" ? "text-destructive" : theme === "success" ? "text-success" : "text-muted-foreground"}`}>
        {index != null && (
          <span className={cn("tabular-nums", theme === "danger" || theme === "success" ? "text-foreground" : "text-primary")}>
            {String(index).padStart(2, "0")}
          </span>
        )}
        {title}
      </h3>
      {children}
    </section >
  );
}

const PILL_TONES = {
  amber: "bg-warning/10 border-warning/30 text-warning",
  green: "bg-success/10 border-success/30 text-success",
  red: "bg-destructive/10 border-destructive/30 text-destructive",
  blue: "bg-primary/10 border-primary/20 text-primary",
  neutral: "bg-card border-border text-muted-foreground",
} as const;

const DOT_TONES = {
  amber: "bg-warning",
  green: "bg-success",
  red: "bg-destructive",
  blue: "bg-primary",
  neutral: "bg-faint",
} as const;

function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[12.5px] font-semibold",
        PILL_TONES[tone],
      )}
    >
      <span className={cn("h-[7px] w-[7px] rounded-full", DOT_TONES[tone])} />
      {children}
    </span>
  );
}

/**
 * Marks a specific value the review had something to say about. Generalized
 * from CritTag below, which was built for criterion statuses and never wired
 * up; both now share one implementation.
 */
function IssueChip({
  tone,
  label,
  title,
}: {
  tone: Tone;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px align-middle text-[11px] font-semibold",
        PILL_TONES[tone],
      )}
    >
      <span className={cn("h-[5px] w-[5px] rounded-full", DOT_TONES[tone])} />
      {label}
    </span>
  );
}

/** All findings for a path, as chips. Renders nothing when there are none. */
function IssueChips({ path }: { path?: string }) {
  const issues = useIssues(path);
  if (issues.length === 0) return null;
  return (
    <>
      {issues.map((issue, i) => (
        <IssueChip
          key={`${issue.code}-${i}`}
          tone={REVIEW_SEVERITY_TONE[issue.severity]}
          label={issueChipLabel(issue)}
          title={issue.message}
        />
      ))}
    </>
  );
}

function CodeChip({ code }: { code?: string }) {
  return (
    <span className="h-fit whitespace-nowrap rounded-md border border-primary/20 bg-primary/10 px-[7px] py-px text-[12.5px] font-semibold tabular-nums text-primary">
      {code}
    </span>
  );
}

const BlueCheckIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
    <circle cx="10" cy="10" r="9" fill="#eff4ff" stroke="#dbe6fe" />
    <path
      d="M6.4 10.3l2.4 2.4L13.8 7.6"
      stroke="#238dd2"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Ring-bullet list (key findings, limitations). Defaults to blue rings; `tone="danger"` renders red rings to match the danger header. */
function FindingsList({
  items,
  tone = "blue",
}: {
  items?: (string | undefined)[];
  tone?: "blue" | "danger";
}) {
  const list = (items ?? []).filter(Boolean);
  const ring =
    tone === "danger"
      ? "border-destructive bg-destructive/20"
      : "border-primary bg-primary/20";
  return (
    <ul className="mt-1.5 flex flex-col gap-[11px] pl-0 list-none">
      {list.map((t, i) => (
        <li
          key={i}
          className="relative pl-[22px] text-[14.5px] leading-[1.55] text-foreground-soft"
        >
          <span
            className={`absolute left-[2px] top-[8px] h-[7px] w-[7px] rounded-full border-[1.5px] ${ring}`}
          />
          {t}
        </li>
      ))}
    </ul>
  );
}

/**
 * The agent writes some variant of "Not provided after PHI removal" in place
 * of a value the HIPAA rules made it strip. That is the one string in a report
 * that has to read as a gap in the REQUEST rather than as a finding, so it is
 * the only text given the destructive ink. The plain "Not provided" fallbacks
 * this file renders itself keep their faint treatment — they mean the user
 * simply supplied nothing, which is ordinary.
 */
const PHI_REMOVED = /\bPHI\s+remov/i;

export function isPhiRemovedText(v: React.ReactNode): boolean {
  return typeof v === "string" && PHI_REMOVED.test(v);
}

function Field({
  k,
  v,
  full,
  na,
}: {
  k: string;
  v: React.ReactNode;
  full?: boolean;
  na?: boolean;
}) {
  return (
    <div className={cn("min-w-0", full && "sm:col-span-2")}>
      <div className="mb-1 text-[12.5px] font-semibold text-muted-foreground">{k}</div>
      <div
        className={cn(
          "text-[15px]",
          na
            ? "text-faint"
            : isPhiRemovedText(v)
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {v}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status maps
// ---------------------------------------------------------------------------

const CRIT_TAG: Record<CriterionStatus, { tone: Tone; label: string }> = {
  met: { tone: "green", label: "Met" },
  not_met: { tone: "amber", label: "Not met" },
  unknown: { tone: "amber", label: "Not documented" },
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function Header({ data }: { data: PartialPriorAuthArtifact }) {
  const det = data.summary?.determination as Determination | undefined;
  const detLabel = data.summary?.determinationLabel;
  const primaryCpt =
    data.requestOverview?.cpt?.[0]?.code ??
    data.requestOverview?.suggestedCpt?.[0]?.code;

  return (
    <header className="mb-[22px]">
      <div className="mb-[9px] flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">


      </div>
      {data.title ? (
        <div className="flex items-center justify-center">

          <h1 className="mr-1 text-[20px] font-bold leading-[1.18] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[27px] mb-5">
            {data.title}
          </h1></div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5">
        {detLabel && det ? (
          <StatusPill tone={DETERMINATION_TONE[det] ?? "amber"}>
            {detLabel}
          </StatusPill>
        ) : null}
        {data.guidelineBasis ? (
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-[5px] text-[12.5px] font-medium text-muted-foreground">
            Guidelines&nbsp;
            <b className="font-semibold text-foreground">
              {GUIDELINE_LABEL[data.guidelineBasis] ?? data.guidelineBasis}
            </b>
          </span>
        ) : null}
        {primaryCpt ? (
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-[5px] text-[12.5px] font-medium text-muted-foreground">
            CPT&nbsp;<b className="font-semibold text-foreground">{primaryCpt}</b>
          </span>
        ) : null}
      </div>
      {data.phiNotice ? (
        <p className="mt-2.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          {data.phiNotice}
        </p>
      ) : null}
      {data.fallbackNotice ? (
        <p className="mt-2.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          {data.fallbackNotice}
        </p>
      ) : null}
      <ReviewBanner review={data.review as ArtifactReview | undefined} />
    </header>
  );
}

/**
 * What the automated checks found, summarised at the top of the report.
 *
 * Deliberately built from the same amber box as `fallbackNotice` above — it is
 * the only warning-shaped element the document has, and a second visual
 * language for "pay attention to this" would dilute both. Collapsed by
 * default; each finding links to the section that contains it.
 */
export function ReviewBanner({ review }: { review?: ArtifactReview }) {
  const [open, setOpen] = React.useState(false);
  const summary = reviewBannerSummary(review);
  if (!summary || !review) return null;

  if (summary.clean) {
    return (
      <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success">
        <span className="h-[6px] w-[6px] rounded-full bg-success" />
        {summary.headline}
      </p>
    );
  }

  const tone = PILL_TONES[summary.tone];
  const unrun = review.checks.filter((c) => c.status !== "ok");

  return (
    <div className={cn("mt-2.5 rounded-md border px-2.5 py-1.5 text-xs", tone)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left font-semibold"
        aria-expanded={open}
      >
        <span className={cn("h-[6px] w-[6px] rounded-full", DOT_TONES[summary.tone])} />
        {summary.headline}
        {summary.counts.info > 0 ? (
          <span className="font-normal opacity-70">
            · {summary.counts.info} note{summary.counts.info === 1 ? "" : "s"}
          </span>
        ) : null}
        <span className="ml-auto font-normal opacity-70">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-current/20 pt-2">
          {review.issues.map((issue, i) => (
            <li key={`${issue.path}-${i}`} className="leading-[1.5]">
              <a
                href={issue.sectionId ? `#${issue.sectionId}` : undefined}
                className={cn(
                  "font-semibold",
                  issue.sectionId && "underline underline-offset-2",
                )}
              >
                {issue.label}
              </a>
              <span className="opacity-80"> — {issue.message}</span>
            </li>
          ))}
          {review.omittedCount ? (
            <li className="opacity-70">
              …and {review.omittedCount} more not shown.
            </li>
          ) : null}
          {/* Why a check produced nothing matters as much as what it found. */}
          {unrun.map((c) => (
            <li key={c.id} className="leading-[1.5] opacity-80">
              <span className="font-semibold">Not checked</span> —{" "}
              {c.id === "code-grounding" ? "code sources" : "report structure"}:{" "}
              {skipReasonLabel(c.reason)}.
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 01 Request Overview
// ---------------------------------------------------------------------------

function OptCol({
  heading,
  codes,
  basePath,
}: {
  heading: string;
  codes?: P<LabeledCode>[];
  basePath?: string;
}) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div>
      <h4 className="mb-3 text-[12px] font-semibold text-muted-foreground">{heading}</h4>
      <ul className="flex flex-col gap-[13px]">
        {list.map((c, i) => (
          <li
            key={i}
            className="grid grid-cols-[auto_1fr] gap-2.5 text-[14px] leading-[1.5]"
          >
            <CodeChip code={c?.code} />
            <span className="text-foreground-soft">
              {c?.label}
              {basePath ? <IssueChips path={`${basePath}[${i}]`} /> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RequestOverviewCard({
  id,
  index,
  ov,
}: {
  id?: string;
  index?: number;
  ov: PartialPriorAuthArtifact["requestOverview"];
}) {
  if (!ov) return null;
  const hasSuggested =
    (ov.suggestedCpt?.length ?? 0) > 0 || (ov.suggestedIcd10?.length ?? 0) > 0;
  const codeText = (codes?: P<LabeledCode>[]) =>
    (codes ?? []).filter(Boolean).map((c) => c?.code).join(", ");
  return (
    <SectionCard id={id} index={index} title="Request Overview">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {ov.treatment ? <Field full k="Treatment" v={ov.treatment} /> : null}
        {ov.diagnosis ? <Field full k="Diagnosis" v={ov.diagnosis} /> : null}
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
      </div>
      {hasSuggested ? (
        <>
          <hr className="my-6 h-px border-0 bg-muted" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <OptCol
              heading="Likely CPT / HCPCS options"
              codes={ov.suggestedCpt}
              basePath="requestOverview.suggestedCpt"
            />
            <OptCol
              heading="Likely ICD-10 options"
              codes={ov.suggestedIcd10}
              basePath="requestOverview.suggestedIcd10"
            />
          </div>
          {ov.suggestedCodesNote ? (
            <p className="mt-4 text-[13px] italic leading-[1.55] text-muted-foreground">
              {ov.suggestedCodesNote}
            </p>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 02 Clinical Context
// ---------------------------------------------------------------------------

export function ClinicalContextCard({
  id,
  index,
  ov,
}: {
  id?: string;
  index?: number;
  ov: PartialPriorAuthArtifact["requestOverview"];
}) {
  if (!ov?.medicalHistory && !(ov?.keyFindings?.length ?? 0)) return null;
  return (
    <SectionCard id={id} index={index} title="Clinical Context">
      {ov?.medicalHistory ? (
        <>
          <h4 className="mb-3 text-[12.5px] font-semibold text-foreground">
            Medical History
          </h4>
          <p
            className={cn(
              "text-[14.5px] leading-[1.62]",
              isPhiRemovedText(ov.medicalHistory)
                ? "text-destructive"
                : "text-foreground-soft",
            )}
          >
            {ov.medicalHistory}
          </p>
        </>
      ) : null}
      {ov?.keyFindings && ov.keyFindings.length > 0 ? (
        <>
          <h4 className="mb-1 mt-[22px] text-[12.5px] font-semibold text-foreground">
            Key Clinical Findings
          </h4>
          <FindingsList items={ov.keyFindings} />
        </>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 03 Prior Authorization Required
// ---------------------------------------------------------------------------

export function PaRequiredCard({
  id,
  index,
  value,
  rationale,
}: {
  id?: string;
  index?: number;
  value?: string;
  rationale?: string;
}) {
  const { tone, label } = paRequiredPresentation(value);
  return (
    <SectionCard id={id} index={index} title="Prior Authorization Required">
      <div className="mb-3.5">
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>
      {rationale ? (
        <p className="text-[14.5px] leading-[1.62] text-foreground-soft">{rationale}</p>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Medicare coverage (NCD / LCD / LCA)
// ---------------------------------------------------------------------------

const ExternalLinkIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-3 w-3 flex-none"
  >
    <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

/** A clickable NCD/LCD/LCA citation chip ("LCD L34567") linking to its source. */
function CitationChip({
  type,
  id,
  href,
}: {
  type?: string;
  id: string;
  href?: string;
}) {
  const label = type ? `${type} ${id}` : id;
  const base =
    "inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-primary";
  if (!href) return <span className={base}>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, "transition-colors hover:bg-primary/20")}
      title="View source on the CMS Medicare Coverage Database"
    >
      {label}
      {ExternalLinkIcon}
    </a>
  );
}

export function MedicarePoliciesCard({
  id,
  index,
  policies,
}: {
  id?: string;
  index?: number;
  policies?: P<CoveragePolicy>[];
}) {
  const list = (policies ?? []).filter(Boolean);
  if (list.length === 0) return null;
  const order: Array<"NCD" | "LCD" | "LCA"> = ["NCD", "LCD", "LCA"];
  return (
    <SectionCard id={id} index={index} title="Medicare Coverage">
      <div className="flex flex-col gap-5">
        {order.map((type) => {
          const group = list.filter((p) => p?.type === type);
          if (group.length === 0) return null;
          return (
            <div key={type}>
              <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {POLICY_GROUP_TITLE[type]}
              </div>
              <div className="flex flex-col gap-2.5">
                {group.map((p, i) => {
                  const src = policySourceUrl(p?.type, p?.policyId, p?.url);
                  return (
                    <div
                      key={i}
                      className="rounded-[11px] border border-border bg-muted p-3.5"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {p?.policyId ? (
                          <CitationChip type={p?.type} id={p.policyId} href={src} />
                        ) : null}
                        <span className="font-semibold text-foreground">
                          {p?.title}
                        </span>
                      </div>
                      {p?.contractor || p?.jurisdiction ? (
                        <div className="text-xs text-muted-foreground">
                          {[p?.contractor, p?.jurisdiction]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}
                      {p?.summary ? (
                        <p className="mt-1.5 text-[14px] leading-[1.55] text-foreground-soft">
                          {p.summary}
                        </p>
                      ) : null}
                      {p?.criteria && p.criteria.length > 0 ? (
                        <div className="mt-2.5 flex flex-col gap-3">
                          {p.criteria.map((c, ci) => (
                            <CriterionRow key={ci} c={c} child />
                          ))}
                        </div>
                      ) : null}
                      {src ? (
                        <a
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View on CMS Medicare Coverage Database
                          {ExternalLinkIcon}
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 04 Medical Necessity Criteria
// ---------------------------------------------------------------------------

function CritTag({ status }: { status?: CriterionStatus }) {
  if (!status) return null;
  const { tone, label } = CRIT_TAG[status] ?? CRIT_TAG.unknown;
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-full border px-[9px] py-[3px] text-[11.5px] font-semibold",
        PILL_TONES[tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_TONES[tone])} />
      {label}
    </span>
  );
}

function CriterionRow({ c, child }: { c?: P<Criterion>; child?: boolean }) {
  if (!c) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3.5">
        <span
          className={cn(
            "font-semibold text-foreground",
            child ? "text-[13.5px]" : "text-[14.5px]",
          )}
        >
          {c.title}
        </span>
        {/* <CritTag status={c.status} /> */}
      </div>
      {c.detail ? (
        <div className="mt-1 text-[14px] leading-[1.55] text-muted-foreground">
          {c.detail}
        </div>
      ) : null}
      {c.subCriteria && c.subCriteria.length > 0 ? (
        <div className="ml-1 mt-3 flex flex-col gap-4 border-l-2 border-border pl-[18px]">
          {c.subCriteria.map((sc, i) => (
            <CriterionRow key={i} c={sc} child />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CriteriaCard({
  id,
  index,
  criteria,
}: {
  id?: string;
  index?: number;
  criteria?: P<Criterion>[];
}) {
  const list = (criteria ?? []).filter(Boolean);
  return (
    <SectionCard id={id} index={index} title="Medical Necessity Criteria">
      <div className="flex flex-col">
        {list.map((c, i) => (
          <div
            key={i}
            className={cn("py-3.5", i === 0 ? "pt-0.5" : "border-t border-border")}
          >
            <CriterionRow c={c} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 05 Relevant Codes
// ---------------------------------------------------------------------------

function CodeTable({
  codes,
  basePath,
}: {
  codes?: P<LabeledCode>[];
  /** artifact path of this list, so findings can be matched per row */
  basePath?: string;
}) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0)
    return <span className="text-[14px] text-faint">Not provided</span>;
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr>
          <th className="w-[84px] border-b border-border pb-[9px] pr-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">
            Code
          </th>
          <th className="border-b border-border pb-[9px] pr-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        {list.map((c, i) => (
          <tr key={i} className="transition-colors hover:bg-accent">
            <td className="w-[84px] whitespace-nowrap border-b border-border py-[11px] pr-3.5 align-top font-semibold tabular-nums text-foreground">
              {c?.code}
            </td>
            <td className="border-b border-border py-[11px] pr-3.5 align-top leading-[1.5] text-foreground-soft">
              {c?.label}
              {c?.note ? <span className="text-faint"> ({c.note})</span> : null}
              {basePath ? <IssueChips path={`${basePath}[${i}]`} /> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CodesCard({
  id,
  index,
  codes,
}: {
  id?: string;
  index?: number;
  codes?: PartialPriorAuthArtifact["relevantCodes"];
}) {
  if (!codes) return null;
  return (
    <SectionCard id={id} index={index} title="Relevant Codes">
      <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        ICD-10
      </div>
      <CodeTable codes={codes.icd10} basePath="relevantCodes.icd10" />
      {codes.icd10Note ? (
        <p className="mt-3 text-[13px] italic leading-[1.55] text-muted-foreground">
          {codes.icd10Note}
        </p>
      ) : null}
      <div className="mb-2.5 mt-[26px] text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        CPT / HCPCS
      </div>
      <CodeTable codes={codes.cpt} basePath="relevantCodes.cpt" />
      {codes.cptNote ? (
        <p className="mt-3 text-[13px] italic leading-[1.55] text-muted-foreground">
          {codes.cptNote}
        </p>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 06 Required Documentation
// ---------------------------------------------------------------------------

export function DocumentationCard({
  id,
  index,
  groups,
  messageId,
}: {
  id?: string;
  index?: number;
  groups?: PartialPriorAuthArtifact["requiredDocumentation"];
  /**
   * Id of the artifact's chat message. When present (and a PriorAuthProvider
   * is mounted) the checkboxes become controlled: toggles are stored per
   * message and flow into the PDF export. Without it they stay read-write but
   * ephemeral (uncontrolled), e.g. in isolated renders.
   */
  messageId?: string;
}) {
  const docChecks = useOptionalPriorAuthDocChecks();
  const overrides = messageId ? docChecks?.docChecks[messageId] : undefined;
  const interactive = Boolean(messageId && docChecks);
  const list = (groups ?? []).filter(Boolean);
  return (
    <SectionCard id={id} index={index} title="Required Documentation" theme="success">
      <div className="flex flex-col gap-[22px]">
        {list.map((g, gi) => {
          const items = (g?.items ?? []).filter(Boolean);
          return (
            <div key={gi}>
              {g?.title ? (
                <h4 className="mb-2 text-[12.5px] font-semibold text-foreground">
                  {g.title}
                </h4>
              ) : null}
              <ul className="flex flex-col gap-3">
                {items.map((d, i) => {
                  const key = docItemKey(g?.title, d?.item);
                  const provided = overrides?.[key] ?? d?.provided === true;
                  return (
                    <li
                      key={i}
                      className="grid grid-cols-[18px_1fr_auto] items-start gap-[11px] text-[14px] leading-[1.5]"
                    >
                      <input
                        type="checkbox"
                        {...(interactive
                          ? {
                            checked: provided,
                            onChange: (
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              docChecks!.setDocCheck(
                                messageId!,
                                key,
                                e.target.checked,
                              ),
                          }
                          : { defaultChecked: provided })}
                        aria-label={provided ? "Provided" : "Not in record"}
                        className="mt-0.5 h-4 w-4 flex-none cursor-pointer rounded border-border accent-[#15803d]"
                      />
                      <span className="min-w-0 text-foreground-soft">{d?.item}</span>
                      {/* {d?.provided === false ? (
                        <span className="flex-none whitespace-nowrap rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                          Not in record
                        </span>
                      ) : (
                        <span />
                      )} */}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 07 Limitations
// ---------------------------------------------------------------------------

export function LimitationsCard({
  id,
  index,
  items,
}: {
  id?: string;
  index?: number;
  items?: (string | undefined)[];
}) {
  return (
    <SectionCard id={id} index={index} title="Limitations & Exclusions" theme="danger">
      <FindingsList items={items} tone="danger" />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// 08 Summary
// ---------------------------------------------------------------------------

export function SummaryCard({
  id,
  index,
  summary,
}: {
  id?: string;
  index?: number;
  summary: PartialPriorAuthArtifact["summary"];
}) {
  if (!summary) return null;
  const strengthen = (summary.missingItems ?? []).filter(Boolean);
  return (
    <SectionCard id={id} index={index} title="Summary" blue>
      {summary.determinationLabel ? (
        <div className="mb-3 text-[17px] font-bold text-foreground">
          {summary.determinationLabel}
        </div>
      ) : null}
      {summary.rationale ? (
        <p className="text-[14.5px] leading-[1.62] text-foreground-soft">
          {summary.rationale}
        </p>
      ) : null}
      {strengthen.length > 0 ? (
        <>
          <h4 className="mb-2 mt-[22px] text-[12.5px] font-semibold text-foreground">
            To strengthen the request
          </h4>
          <ul className="flex flex-col gap-2.5">
            {strengthen.map((t, i) => (
              <li
                key={i}
                className="grid grid-cols-[20px_1fr] items-start gap-[11px] text-[14.5px] leading-[1.5] text-foreground-soft"
              >
                <span className="mt-px">{BlueCheckIcon}</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SectionCard>
  );
}

export function DisclaimerBlock({ disclaimer }: { disclaimer?: string }) {
  return (
    <>
      {disclaimer ? (
        <p className="my-1.5 px-1 text-[12.5px] italic leading-[1.6] text-faint">
          {disclaimer}
        </p>
      ) : null}
      <div className="flex items-start gap-2.5 rounded-[11px] border border-primary/20 bg-primary/10 px-4 py-3.5 text-[13.5px] italic leading-[1.55] text-primary">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-px h-[17px] w-[17px] flex-none"
        >
          <path d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.74A2 2 0 0 0 3.53 22h16.94a2 2 0 0 0 1.73-3.4L13.7 3.86a2 2 0 0 0-3.4 0z" />
        </svg>
        <span>
          Always verify with payer portal guidelines prior to submission. This
          analysis is based on publicly available information.
        </span>
      </div>
    </>
  );
}
