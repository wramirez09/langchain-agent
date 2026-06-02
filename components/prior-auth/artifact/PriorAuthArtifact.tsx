"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { parsePartialJson } from "@/lib/priorAuth/partialJson";
import type {
  PartialPriorAuthArtifact,
  Determination,
} from "@/lib/priorAuth/artifactSchema";
import { ARTIFACT_KIND } from "@/lib/priorAuth/artifactSchema";
import { ArtifactSkeleton, SectionSkeleton } from "./ArtifactSkeleton";
import {
  Header,
  RequestOverviewCard,
  ClinicalContextCard,
  PaRequiredCard,
  MedicarePoliciesCard,
  CriteriaCard,
  CodesCard,
  DocumentationCard,
  LimitationsCard,
  SummaryCard,
  DisclaimerBlock,
} from "./ArtifactSections";

/**
 * Cheap heuristic to decide whether an assistant message is (or is becoming) a
 * PriorAuthArtifact JSON object vs. a plain text/markdown message.
 */
export function looksLikeArtifact(content: string): boolean {
  const t = content.trimStart();
  if (!t.startsWith("{") && !t.startsWith("```")) return false;
  return (
    t.includes(ARTIFACT_KIND) ||
    t.includes('"kind"') ||
    t.includes('"requestOverview"') ||
    t.includes('"medicalNecessityCriteria"')
  );
}

function has(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v != null && v !== "";
}

const DET_SHORT: Record<Determination, string> = {
  meets_criteria: "Meets criteria",
  conditional: "Conditional",
  more_info_needed: "More info needed",
  likely_denial: "Likely denial",
  not_supported: "Not supported",
};

export function PriorAuthArtifact({
  raw,
  streaming = false,
  withNav = false,
}: {
  raw: string;
  streaming?: boolean;
  /** Output-tab only: render the sticky left-side TOC + scroll-spy. */
  withNav?: boolean;
}) {
  const data = parsePartialJson<PartialPriorAuthArtifact>(raw);

  if (!data || typeof data !== "object") {
    return streaming ? <ArtifactSkeleton /> : null;
  }

  const summaryDone = has(data.summary) && has(data.summary?.rationale);

  // Build the ordered list of present sections. Numbering is derived from
  // what's present (stable because the JSON streams top-down in this order).
  const builders: Array<{ id: string; nav: string; render: (i: number) => React.ReactNode }> = [];
  const add = (cond: boolean, id: string, nav: string, render: (i: number) => React.ReactNode) => {
    if (cond) builders.push({ id, nav, render });
  };

  add(has(data.requestOverview), "overview", "Request Overview", (i) => (
    <RequestOverviewCard id="overview" index={i} ov={data.requestOverview} />
  ));
  add(
    has(data.requestOverview?.medicalHistory) || has(data.requestOverview?.keyFindings),
    "context",
    "Clinical Context",
    (i) => <ClinicalContextCard id="context" index={i} ov={data.requestOverview} />,
  );
  add(has(data.priorAuthRequired), "authorization", "Authorization", (i) => (
    <PaRequiredCard
      id="authorization"
      index={i}
      value={data.priorAuthRequired}
      rationale={data.priorAuthRationale}
    />
  ));
  add(has(data.medicarePolicies), "medicare", "Medicare Coverage", (i) => (
    <MedicarePoliciesCard id="medicare" index={i} policies={data.medicarePolicies} />
  ));
  add(has(data.medicalNecessityCriteria), "criteria", "Necessity Criteria", (i) => (
    <CriteriaCard id="criteria" index={i} criteria={data.medicalNecessityCriteria} />
  ));
  add(has(data.relevantCodes), "codes", "Relevant Codes", (i) => (
    <CodesCard id="codes" index={i} codes={data.relevantCodes} />
  ));
  add(has(data.requiredDocumentation), "documentation", "Required Docs", (i) => (
    <DocumentationCard id="documentation" index={i} groups={data.requiredDocumentation} />
  ));
  add(has(data.limitations), "limitations", "Limitations", (i) => (
    <LimitationsCard id="limitations" index={i} items={data.limitations} />
  ));
  add(has(data.summary), "summary", "Summary", (i) => (
    <SummaryCard id="summary" index={i} summary={data.summary} />
  ));

  const doc = (
    <div className="min-w-0">
      <Header data={data} />
      <div className="flex flex-col gap-[18px]">
        {builders.map((b, i) => (
          <React.Fragment key={b.id}>{b.render(i + 1)}</React.Fragment>
        ))}
        {streaming && !summaryDone && <SectionSkeleton lines={2} />}
      </div>
      {has(data.disclaimer) && <div className="mt-[18px]"><DisclaimerBlock disclaimer={data.disclaimer} /></div>}
    </div>
  );

  if (!withNav) return doc;

  const det = data.summary?.determination as Determination | undefined;
  return (
    <ArtifactWithNav navItems={builders.map((b) => ({ id: b.id, nav: b.nav }))} determination={det}>
      {doc}
    </ArtifactWithNav>
  );
}

function ArtifactWithNav({
  navItems,
  determination,
  children,
}: {
  navItems: Array<{ id: string; nav: string }>;
  determination?: Determination;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = navItems.map((n) => n.id).join(",");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("section[id]");
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id);
        });
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key]);

  return (
    <div
      ref={rootRef}
      className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[236px_minmax(0,1fr)]"
    >
      <aside className="sticky top-4 hidden lg:block">
        <div className="px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
          On this page
        </div>
        <nav className="flex flex-col gap-px">
          {navItems.map((n, i) => {
            const active = activeId === n.id;
            return (
              <a
                key={n.id}
                href={`#${n.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-white text-[#2563eb] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_28px_-18px_rgba(16,24,40,0.18)]"
                    : "text-[#64748b] hover:bg-white hover:text-[#0f172a]",
                )}
              >
                <span
                  className={cn(
                    "w-[18px] flex-none text-center text-[11px] font-semibold tabular-nums",
                    active ? "text-[#2563eb]" : "text-[#94a3b8]",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {n.nav}
              </a>
            );
          })}
        </nav>
        {determination ? (
          <div className="mt-4 rounded-[11px] border border-[#dbe6fe] bg-[#eff4ff] px-3.5 py-3">
            <div className="mb-1 text-xs text-[#64748b]">Determination</div>
            <div className="text-sm font-bold text-[#1d4ed8]">
              {DET_SHORT[determination] ?? determination}
            </div>
          </div>
        ) : null}
      </aside>
      {children}
    </div>
  );
}
