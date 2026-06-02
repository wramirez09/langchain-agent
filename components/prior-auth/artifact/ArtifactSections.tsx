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

type P<T> = DeepPartial<T>;

// Design tokens (from the NoteDoctor design handoff) as exact Tailwind
// arbitrary values so the React render matches the prototype.
const CARD =
  "rounded-[14px] border border-[#e6eaf2] bg-white p-5 sm:p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_28px_-18px_rgba(16,24,40,0.18)]";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SectionCard({
  id,
  index,
  title,
  blue,
  children,
}: {
  id?: string;
  index?: number;
  title: string;
  blue?: boolean;
  children: React.ReactNode;
  theme?: string;
}) {
  return (
    <section id={id} className={cn(CARD, blue && "border-[#dbe6fe]", "scroll-mt-4")}>
      <h3 className={`mb-[18px] flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.09em] theme ==== "danger" ? red : text-[#64748b]`}>
        {index != null && (
          <span className="tabular-nums text-[#2563eb]">
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
  amber: "bg-[#fff8ec] border-[#f7e0b0] text-[#b45309]",
  green: "bg-[#edfcf2] border-[#bbf0cb] text-[#15803d]",
  red: "bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]",
  blue: "bg-[#eff4ff] border-[#dbe6fe] text-[#1d4ed8]",
  neutral: "bg-white border-[#e6eaf2] text-[#475569]",
} as const;

const DOT_TONES = {
  amber: "bg-[#d97706]",
  green: "bg-[#15803d]",
  red: "bg-[#b91c1c]",
  blue: "bg-[#2563eb]",
  neutral: "bg-[#94a3b8]",
} as const;

type Tone = keyof typeof PILL_TONES;

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

function CodeChip({ code }: { code?: string }) {
  return (
    <span className="h-fit whitespace-nowrap rounded-md border border-[#dbe6fe] bg-[#eff4ff] px-[7px] py-px text-[12.5px] font-semibold tabular-nums text-[#1d4ed8]">
      {code}
    </span>
  );
}

const BlueCheckIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
    <circle cx="10" cy="10" r="9" fill="#eff4ff" stroke="#dbe6fe" />
    <path
      d="M6.4 10.3l2.4 2.4L13.8 7.6"
      stroke="#2563eb"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Blue-ring bullet list (key findings, limitations). */
function FindingsList({ items }: { items?: (string | undefined)[] }) {
  const list = (items ?? []).filter(Boolean);
  return (
    <ul className="mt-1.5 flex flex-col gap-[11px] pl-0 list-none">
      {list.map((t, i) => (
        <li
          key={i}
          className="relative pl-[22px] text-[14.5px] leading-[1.55] text-[#283142]"
        >
          <span className="absolute left-[2px] top-[8px] h-[7px] w-[7px] rounded-full border-[1.5px] border-[#2563eb] bg-[#dbe6fe]" />
          {t}
        </li>
      ))}
    </ul>
  );
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
      <div className="mb-1 text-[12.5px] font-semibold text-[#475569]">{k}</div>
      <div className={cn("text-[15px]", na ? "text-[#94a3b8]" : "text-[#0f172a]")}>
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

const DETERMINATION_TONE: Record<Determination, Tone> = {
  meets_criteria: "green",
  conditional: "amber",
  more_info_needed: "amber",
  likely_denial: "red",
  not_supported: "red",
};

const GUIDELINE_LABEL: Record<string, string> = {
  medicare: "Medicare",
  commercial: "Commercial",
  "commercial-fallback": "Commercial (fallback)",
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
      <div className="mb-[9px] flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">


      </div>
      {data.title ? (
        <div className="flex items-center justify-center">

          <h1 className="mr-1 text-[20px] font-bold leading-[1.18] tracking-[-0.02em] text-[#0f172a] [text-wrap:balance] sm:text-[27px] mb-5">
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
          <span className="inline-flex items-center rounded-full border border-[#e6eaf2] bg-white px-3 py-[5px] text-[12.5px] font-medium text-[#64748b]">
            Guidelines&nbsp;
            <b className="font-semibold text-[#0f172a]">
              {GUIDELINE_LABEL[data.guidelineBasis] ?? data.guidelineBasis}
            </b>
          </span>
        ) : null}
        {primaryCpt ? (
          <span className="inline-flex items-center rounded-full border border-[#e6eaf2] bg-white px-3 py-[5px] text-[12.5px] font-medium text-[#64748b]">
            CPT&nbsp;<b className="font-semibold text-[#0f172a]">{primaryCpt}</b>
          </span>
        ) : null}
      </div>
      {data.phiNotice ? (
        <p className="mt-2.5 text-[12.5px] text-[#94a3b8]">{data.phiNotice}</p>
      ) : null}
      {data.fallbackNotice ? (
        <p className="mt-2.5 rounded-md border border-[#f7e0b0] bg-[#fff8ec] px-2.5 py-1.5 text-xs text-[#b45309]">
          {data.fallbackNotice}
        </p>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// 01 Request Overview
// ---------------------------------------------------------------------------

function OptCol({ heading, codes }: { heading: string; codes?: P<LabeledCode>[] }) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div>
      <h4 className="mb-3 text-[12px] font-semibold text-[#64748b]">{heading}</h4>
      <ul className="flex flex-col gap-[13px]">
        {list.map((c, i) => (
          <li
            key={i}
            className="grid grid-cols-[auto_1fr] gap-2.5 text-[14px] leading-[1.5]"
          >
            <CodeChip code={c?.code} />
            <span className="text-[#283142]">{c?.label}</span>
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
          <hr className="my-6 h-px border-0 bg-[#edf0f6]" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <OptCol heading="Likely CPT / HCPCS options" codes={ov.suggestedCpt} />
            <OptCol heading="Likely ICD-10 options" codes={ov.suggestedIcd10} />
          </div>
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
          <h4 className="mb-3 text-[12.5px] font-semibold text-[#0f172a]">
            Medical History
          </h4>
          <p className="text-[14.5px] leading-[1.62] text-[#283142]">
            {ov.medicalHistory}
          </p>
        </>
      ) : null}
      {ov?.keyFindings && ov.keyFindings.length > 0 ? (
        <>
          <h4 className="mb-1 mt-[22px] text-[12.5px] font-semibold text-[#0f172a]">
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
  const tone: Tone = value === "NO" ? "green" : "amber";
  const label =
    value === "YES" ? "Required" : value === "NO" ? "Not required" : "Conditional";
  return (
    <SectionCard id={id} index={index} title="Prior Authorization Required">
      <div className="mb-3.5">
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>
      {rationale ? (
        <p className="text-[14.5px] leading-[1.62] text-[#283142]">{rationale}</p>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Medicare coverage (NCD / LCD / LCA)
// ---------------------------------------------------------------------------

const POLICY_GROUP_TITLE: Record<string, string> = {
  NCD: "National Coverage Determinations (NCD)",
  LCD: "Local Coverage Determinations (LCD)",
  LCA: "Local Coverage Articles (LCA)",
};

const ExternalLinkIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-3 w-3 flex-none"
  >
    <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

/**
 * Resolve a citation's source link. Prefers the agent-supplied URL; otherwise
 * builds the canonical CMS Medicare Coverage Database URL from the policy id
 * (LCD/LCA ids drop their letter prefix for the query param; NCD keeps its
 * dotted number).
 */
function policySourceUrl(
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
    "inline-flex items-center gap-1 rounded-md border border-[#dbe6fe] bg-[#eff4ff] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#1d4ed8]";
  if (!href) return <span className={base}>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, "transition-colors hover:bg-[#dbe6fe]")}
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
              <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#64748b]">
                {POLICY_GROUP_TITLE[type]}
              </div>
              <div className="flex flex-col gap-2.5">
                {group.map((p, i) => {
                  const src = policySourceUrl(p?.type, p?.policyId, p?.url);
                  return (
                    <div
                      key={i}
                      className="rounded-[11px] border border-[#eef1f7] bg-[#f8fafc] p-3.5"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {p?.policyId ? (
                          <CitationChip type={p?.type} id={p.policyId} href={src} />
                        ) : null}
                        <span className="font-semibold text-[#0f172a]">
                          {p?.title}
                        </span>
                      </div>
                      {p?.contractor || p?.jurisdiction ? (
                        <div className="text-xs text-[#64748b]">
                          {[p?.contractor, p?.jurisdiction]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}
                      {p?.summary ? (
                        <p className="mt-1.5 text-[14px] leading-[1.55] text-[#283142]">
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
                          className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#2563eb] hover:underline"
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
            "font-semibold text-[#0f172a]",
            child ? "text-[13.5px]" : "text-[14.5px]",
          )}
        >
          {c.title}
        </span>
        {/* <CritTag status={c.status} /> */}
      </div>
      {c.detail ? (
        <div className="mt-1 text-[14px] leading-[1.55] text-[#64748b]">
          {c.detail}
        </div>
      ) : null}
      {c.subCriteria && c.subCriteria.length > 0 ? (
        <div className="ml-1 mt-3 flex flex-col gap-4 border-l-2 border-[#eef1f7] pl-[18px]">
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
            className={cn("py-3.5", i === 0 ? "pt-0.5" : "border-t border-[#edf0f6]")}
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

function CodeTable({ codes }: { codes?: P<LabeledCode>[] }) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0)
    return <span className="text-[14px] text-[#94a3b8]">Not provided</span>;
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr>
          <th className="w-[84px] border-b border-[#e6eaf2] pb-[9px] pr-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[#94a3b8]">
            Code
          </th>
          <th className="border-b border-[#e6eaf2] pb-[9px] pr-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[#94a3b8]">
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        {list.map((c, i) => (
          <tr key={i} className="transition-colors hover:bg-[#f8fafc]">
            <td className="w-[84px] whitespace-nowrap border-b border-[#edf0f6] py-[11px] pr-3.5 align-top font-semibold tabular-nums text-[#0f172a]">
              {c?.code}
            </td>
            <td className="border-b border-[#edf0f6] py-[11px] pr-3.5 align-top leading-[1.5] text-[#283142]">
              {c?.label}
              {c?.note ? <span className="text-[#94a3b8]"> ({c.note})</span> : null}
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
      <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#64748b]">
        ICD-10
      </div>
      <CodeTable codes={codes.icd10} />
      {codes.icd10Note ? (
        <p className="mt-3 text-[13px] italic leading-[1.55] text-[#64748b]">
          {codes.icd10Note}
        </p>
      ) : null}
      <div className="mb-2.5 mt-[26px] text-[12px] font-semibold uppercase tracking-[0.04em] text-[#64748b]">
        CPT / HCPCS
      </div>
      <CodeTable codes={codes.cpt} />
      {codes.cptNote ? (
        <p className="mt-3 text-[13px] italic leading-[1.55] text-[#64748b]">
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
}: {
  id?: string;
  index?: number;
  groups?: PartialPriorAuthArtifact["requiredDocumentation"];
}) {
  const list = (groups ?? []).filter(Boolean);
  return (
    <SectionCard id={id} index={index} title="Required Documentation">
      <div className="flex flex-col gap-[22px]">
        {list.map((g, gi) => {
          const items = (g?.items ?? []).filter(Boolean);
          return (
            <div key={gi}>
              {g?.title ? (
                <h4 className="mb-2 text-[12.5px] font-semibold text-[#0f172a]">
                  {g.title}
                </h4>
              ) : null}
              <ul className="flex flex-col gap-3">
                {items.map((d, i) => {
                  const provided = d?.provided === true;
                  return (
                    <li
                      key={i}
                      className="grid grid-cols-[18px_1fr_auto] items-start gap-[11px] text-[14px] leading-[1.5]"
                    >
                      <input
                        type="checkbox"
                        defaultChecked={provided}
                        aria-label={provided ? "Provided" : "Not in record"}
                        className="mt-0.5 h-4 w-4 flex-none cursor-pointer rounded border-[#cbd5e1] accent-[#15803d]"
                      />
                      <span className="min-w-0 text-[#283142]">{d?.item}</span>
                      {/* {d?.provided === false ? (
                        <span className="flex-none whitespace-nowrap rounded-full border border-[#f7e0b0] bg-[#fff8ec] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">
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
      <FindingsList items={items} />
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
        <div className="mb-3 text-[17px] font-bold text-[#0f172a]">
          {summary.determinationLabel}
        </div>
      ) : null}
      {summary.rationale ? (
        <p className="text-[14.5px] leading-[1.62] text-[#283142]">
          {summary.rationale}
        </p>
      ) : null}
      {strengthen.length > 0 ? (
        <>
          <h4 className="mb-2 mt-[22px] text-[12.5px] font-semibold text-[#0f172a]">
            To strengthen the request
          </h4>
          <ul className="flex flex-col gap-2.5">
            {strengthen.map((t, i) => (
              <li
                key={i}
                className="grid grid-cols-[20px_1fr] items-start gap-[11px] text-[14.5px] leading-[1.5] text-[#283142]"
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
        <p className="my-1.5 px-1 text-[12.5px] italic leading-[1.6] text-[#94a3b8]">
          {disclaimer}
        </p>
      ) : null}
      <div className="flex items-start gap-2.5 rounded-[11px] border border-[#dbe6fe] bg-[#eff4ff] px-4 py-3.5 text-[13.5px] italic leading-[1.55] text-[#1d4ed8]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
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
