"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { parseArtifactText } from "@/lib/priorAuth/extractArtifact";
import type { Determination } from "@/lib/priorAuth/artifactSchema";
import {
  ARTIFACT_SECTIONS,
  has,
  type ArtifactSectionId,
} from "@/lib/priorAuth/artifactSections";
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
  ArtifactReviewProvider,
} from "./ArtifactSections";
import type { ArtifactReview } from "@/lib/priorAuth/review/types";

// Moved to lib so non-client modules (PDF export) can share it; re-exported
// here so existing imports keep working.
export { looksLikeArtifact } from "@/lib/priorAuth/extractArtifact";

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
  messageId,
}: {
  raw: string;
  streaming?: boolean;
  /** Output-tab only: render the sticky left-side TOC + scroll-spy. */
  withNav?: boolean;
  /**
   * Id of the chat message this artifact came from. Enables persistent,
   * per-message documentation checkbox toggles that flow into the PDF export.
   */
  messageId?: string;
}) {
  const data = parseArtifactText(raw);

  if (!data || typeof data !== "object") {
    return streaming ? <ArtifactSkeleton /> : null;
  }

  const summaryDone = has(data.summary) && has(data.summary?.rationale);

  // The Output tab stacks every query's report on one page, so the section
  // ids have to be unique per report — otherwise the second document's nav
  // would scroll to the first document's sections, and the ids themselves
  // would be duplicated. The message id is the scope. Without one (the chat
  // panel renders a single artifact, no nav) the bare manifest ids stand.
  const sectionDomId = (id: ArtifactSectionId) =>
    messageId ? `${messageId}-${id}` : id;

  // Order, ids, and presence conditions come from the shared manifest so the
  // PDF numbers its sections identically. Numbering is derived from what's
  // present (stable because the JSON streams top-down in this order).
  const renderers: Record<ArtifactSectionId, (i: number) => React.ReactNode> = {
    overview: (i) => <RequestOverviewCard id={sectionDomId("overview")} index={i} ov={data.requestOverview} />,
    context: (i) => <ClinicalContextCard id={sectionDomId("context")} index={i} ov={data.requestOverview} />,
    authorization: (i) => (
      <PaRequiredCard
        id={sectionDomId("authorization")}
        index={i}
        value={data.priorAuthRequired}
        rationale={data.priorAuthRationale}
      />
    ),
    medicare: (i) => (
      <MedicarePoliciesCard id={sectionDomId("medicare")} index={i} policies={data.medicarePolicies} />
    ),
    criteria: (i) => (
      <CriteriaCard id={sectionDomId("criteria")} index={i} criteria={data.medicalNecessityCriteria} />
    ),
    codes: (i) => <CodesCard id={sectionDomId("codes")} index={i} codes={data.relevantCodes} />,
    documentation: (i) => (
      <DocumentationCard
        id={sectionDomId("documentation")}
        index={i}
        groups={data.requiredDocumentation}
        messageId={messageId}
      />
    ),
    limitations: (i) => <LimitationsCard id={sectionDomId("limitations")} index={i} items={data.limitations} />,
    summary: (i) => <SummaryCard id={sectionDomId("summary")} index={i} summary={data.summary} />,
  };

  const builders = ARTIFACT_SECTIONS.filter((s) => s.present(data)).map((s) => ({
    id: sectionDomId(s.id),
    nav: s.nav,
    render: renderers[s.id],
  }));

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

  const det = data.summary?.determination as Determination | undefined;
  const body = withNav ? (
    <ArtifactWithNav navItems={builders.map((b) => ({ id: b.id, nav: b.nav }))} determination={det}>
      {doc}
    </ArtifactWithNav>
  ) : (
    doc
  );

  // Findings reach the individual cards through context rather than being
  // threaded down as props — the cards take indexed-access artifact slices, so
  // adding a review prop to each would touch every signature.
  return (
    <ArtifactReviewProvider review={data.review as ArtifactReview | undefined}>
      {body}
    </ArtifactReviewProvider>
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
        <div className="px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
          On this page
        </div>
        <nav className="flex flex-col gap-px">
          {navItems.map((n, i) => {
            // Before any section has intersected (fresh mount / scrolled to
            // top), default the highlight to the first section — Request
            // Overview when present.
            const active = (activeId ?? navItems[0]?.id) === n.id;
            return (
              <a
                key={n.id}
                href={`#${n.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveId(n.id);
                  const el = rootRef.current?.ownerDocument.getElementById(n.id);
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  // Replay the highlight pulse on every click (force reflow so
                  // the animation re-triggers even on the same target).
                  el.classList.remove("nd-flash");
                  void el.offsetWidth;
                  el.classList.add("nd-flash");
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-card text-primary shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_28px_-18px_rgba(16,24,40,0.18)]"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "w-[18px] flex-none text-center text-[11px] font-semibold tabular-nums",
                    active ? "text-primary" : "text-faint",
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
          <div className="mt-4 rounded-[11px] border border-primary/20 bg-primary/10 px-3.5 py-3">
            <div className="mb-1 text-xs text-muted-foreground">Determination</div>
            <div className="text-sm font-bold text-primary">
              {DET_SHORT[determination] ?? determination}
            </div>
          </div>
        ) : null}
      </aside>
      {children}
    </div>
  );
}
