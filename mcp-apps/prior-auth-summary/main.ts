import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";
import type { CallToolResult } from "@modelcontextprotocol/server";

import type {
  Criterion,
  CriterionStatus,
  LabeledCode,
  PriorAuthArtifact,
} from "@/lib/priorAuth/artifactSchema";
import type { ArtifactReview } from "@/lib/priorAuth/review/types";
import {
  DETERMINATION_BADGE,
  DOC_ITEM_STATE_LABEL,
  GUIDELINE_LABEL,
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
  type DeterminationBadge,
  type DocItemState,
} from "@/lib/priorAuth/artifactPresentation";
import {
  CRITERION_STATUS_LABEL,
  criteriaCounts,
  documentationCountText,
  inlineCode,
  renderPriorAuthMarkdown,
} from "@/lib/priorAuth/renderPriorAuthMarkdown";

/**
 * MCP Apps view for `run_prior_auth_screening`. Receives the tool result over
 * the host bridge and renders `structuredContent.artifact` as the full report.
 *
 * Every string from the artifact goes in through `textContent`, never
 * `innerHTML` — the artifact is model output built from user-typed text.
 */

const root = document.getElementById("root") as HTMLElement;

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

function show(...nodes: Child[]): void {
  root.replaceChildren(...nodes.filter((n): n is Node | string => !!n));
}

/* ---------- states ---------- */

function renderLoading(): void {
  show(
    el(
      "div",
      { class: "card state" },
      el("div", { class: "spinner", role: "presentation" }),
      el("p", {}, "Running the prior authorization screening…"),
      el(
        "p",
        { class: "fine" },
        "Researching coverage policy. This usually takes about a minute.",
      ),
    ),
  );
}

function renderError(message: string): void {
  show(
    el(
      "div",
      { class: "card state" },
      el("p", {}, el("span", { class: "pill warn" }, "Screening failed")),
      el("p", { class: "muted" }, message),
    ),
  );
}

/** Unknown schema or a plain-text answer: show the server's markdown as-is. */
function renderFallback(markdown: string): void {
  show(
    el("div", { class: "card" }, el("pre", { class: "fallback" }, markdown)),
    actions(markdown),
  );
}

/* ---------- pieces ---------- */

const STATUS_PILL: Record<CriterionStatus, string> = {
  met: "good",
  not_met: "warn",
  unknown: "",
};
const STATUS_GLYPH: Record<CriterionStatus, string> = {
  met: "✓",
  not_met: "✕",
  unknown: "?",
};

function statusPill(status: CriterionStatus): HTMLElement {
  return el(
    "span",
    { class: `pill ${STATUS_PILL[status]}` },
    `${STATUS_GLYPH[status]} ${CRITERION_STATUS_LABEL[status]}`,
  );
}

const BADGE: Record<DeterminationBadge, { cls: string; label: string }> = {
  approve: { cls: "good", label: "✓ Approve" },
  conditional: { cls: "info", label: "◐ Conditional" },
  deny: { cls: "warn", label: "✕ Deny" },
  unknown: { cls: "", label: "? Unknown" },
};

function section(
  title: string,
  count: string | null,
  ...body: Child[]
): HTMLElement {
  return el(
    "section",
    { class: "card" },
    el(
      "h2",
      {},
      el("span", {}, title),
      count ? el("span", { class: "count" }, count) : null,
    ),
    ...body,
  );
}

function criterionItem(c: Criterion): HTMLElement {
  const subs = c.subCriteria ?? [];
  if (!c.detail && subs.length === 0) {
    return el(
      "li",
      { class: "criterion" },
      el(
        "div",
        { class: "plain" },
        el("span", { class: "title" }, c.title),
        statusPill(c.status),
      ),
    );
  }
  return el(
    "li",
    { class: "criterion" },
    el(
      "details",
      {},
      el(
        "summary",
        {},
        el("span", { class: "title" }, c.title),
        statusPill(c.status),
      ),
      c.detail ? el("p", { class: "detail" }, c.detail) : null,
      subs.length
        ? el("ul", { class: "criteria" }, ...subs.map(criterionItem))
        : null,
    ),
  );
}

function codeTable(
  caption: string,
  codes: LabeledCode[],
  note?: string,
): HTMLElement {
  return el(
    "div",
    {},
    el("h3", {}, caption),
    codes.length
      ? el(
          "div",
          { class: "table-wrap" },
          el(
            "table",
            {},
            el(
              "thead",
              {},
              el("tr", {}, el("th", {}, "Code"), el("th", {}, "Description")),
            ),
            el(
              "tbody",
              {},
              ...codes.map((c) =>
                el(
                  "tr",
                  {},
                  el("td", { class: "code" }, c.code),
                  el(
                    "td",
                    {},
                    c.label,
                    c.note ? el("div", { class: "fine" }, c.note) : null,
                  ),
                ),
              ),
            ),
          ),
        )
      : el("p", { class: "muted" }, "None listed."),
    note ? el("p", { class: "fine" }, note) : null,
  );
}

/** Same three states as the markdown: provided / missing / not confirmed. */
const DOC_MARK: Record<DocItemState, string> = {
  provided: "✓",
  missing: "!",
  unconfirmed: "?",
};

function docItem(item: string, provided?: boolean | null): HTMLElement {
  const state = docItemState(provided);
  return el(
    "li",
    { class: `doc ${state}` },
    el("span", { class: "mark" }, DOC_MARK[state]),
    el("span", {}, item),
    el("span", { class: "tag" }, DOC_ITEM_STATE_LABEL[state]),
  );
}

/** Links go through the host: a sandboxed view cannot navigate itself. */
function sourceLink(url: string): HTMLElement {
  const a = el("a", { href: url, class: "source", rel: "noopener" }, url);
  a.addEventListener("click", (e) => {
    e.preventDefault();
    void app.openLink({ url }).catch(() => undefined);
  });
  return a;
}

function reviewSection(review: ArtifactReview): HTMLElement | null {
  const summary = reviewBannerSummary(review);
  if (!summary) return null;
  const items: HTMLElement[] = review.issues.map((i) =>
    el(
      "li",
      {},
      el(
        "span",
        { class: `pill ${i.severity === "info" ? "info" : "warn"}` },
        REVIEW_SEVERITY_LABEL[i.severity],
      ),
      " ",
      el("strong", {}, i.label),
      ` — ${i.message} `,
      el("span", { class: "fine" }, `(${issueChipLabel(i)})`),
    ),
  );
  if (review.omittedCount) {
    items.push(el("li", {}, `…and ${review.omittedCount} more not shown.`));
  }
  for (const c of unrunChecks(review)) {
    const verb = c.status === "partial" ? "Partly checked" : "Not checked";
    items.push(
      el(
        "li",
        { class: "muted" },
        `${verb} — ${reviewCheckLabel(c.id)}: ${skipReasonLabel(c.reason)}.`,
      ),
    );
  }
  if (review.repairs.length) {
    const n = review.repairs.length;
    items.push(
      el(
        "li",
        { class: "muted" },
        `${n} ${n === 1 ? "field was" : "fields were"} filled from the guideline before the checks ran.`,
      ),
    );
  }
  return section(
    "Automated review",
    null,
    el("p", {}, el("strong", {}, summary.headline)),
    items.length ? el("ul", { class: "review" }, ...items) : null,
  );
}

function list(items: string[]): HTMLElement {
  return items.length
    ? el("ul", {}, ...items.map((i) => el("li", {}, i)))
    : el("p", { class: "muted" }, "None listed.");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sandboxed iframes often deny the async clipboard; fall back to a
    // selection copy, which needs only the user gesture we already have.
    const ta = el("textarea", {
      readonly: "",
      style: "position:fixed;opacity:0",
    });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function actions(markdown: string): HTMLElement {
  const button = el("button", { type: "button" }, "Copy as markdown");
  button.addEventListener("click", async () => {
    const ok = await copyText(markdown);
    button.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => (button.textContent = "Copy as markdown"), 2000);
  });
  // No "Open full report" link: there is no /screenings/{threadId} route yet.
  return el("div", { class: "actions card" }, button);
}

/* ---------- report ---------- */

function renderReport(a: PriorAuthArtifact): void {
  const o = a.requestOverview;
  const badge =
    BADGE[DETERMINATION_BADGE[a.summary.determination] ?? "unknown"];
  const pa = paRequiredPresentation(a.priorAuthRequired);
  const cc = criteriaCounts(a.medicalNecessityCriteria);
  const codesOf = (cs: LabeledCode[]) =>
    cs.length ? cs.map(inlineCode).join("; ") : "Not provided";

  const overview: [string, string][] = [
    ["Treatment", o.treatment],
    ...(o.diagnosis
      ? ([["Diagnosis", o.diagnosis]] as [string, string][])
      : []),
    ["Submitted CPT/HCPCS", codesOf(o.cpt)],
    ["Submitted ICD-10", codesOf(o.icd10)],
    ["History", o.medicalHistory || "Not provided"],
  ];

  show(
    // 1. Header
    el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "header" },
        el(
          "div",
          {},
          el("h1", {}, a.title),
          el(
            "p",
            { class: "muted", style: "margin:6px 0 0" },
            determinationText(a.summary),
          ),
        ),
        el(
          "div",
          { class: "header-row" },
          el(
            "span",
            { class: "pill basis" },
            GUIDELINE_LABEL[a.guidelineBasis] ?? a.guidelineBasis,
          ),
          el("span", { class: `pill strong ${badge.cls}` }, badge.label),
        ),
      ),
      a.summary.rationale
        ? el("p", { style: "margin:12px 0 0" }, a.summary.rationale)
        : null,
      a.phiNotice
        ? el("p", { class: "notice", style: "margin-top:12px" }, a.phiNotice)
        : null,
      a.fallbackNotice
        ? el(
            "p",
            { class: "notice", style: "margin-top:12px" },
            a.fallbackNotice,
          )
        : null,
    ),
    // 2. Request overview
    section(
      "Request overview",
      null,
      el(
        "dl",
        { class: "overview" },
        ...overview.map(([k, v]) =>
          el("div", {}, el("dt", {}, k), el("dd", {}, v)),
        ),
      ),
      el("h3", {}, "Key findings"),
      list(o.keyFindings),
      o.suggestedCpt?.length
        ? codeTable("Likely CPT/HCPCS options", o.suggestedCpt)
        : null,
      o.suggestedIcd10?.length
        ? codeTable("Likely ICD-10 options", o.suggestedIcd10)
        : null,
      o.suggestedCodesNote
        ? el("p", { class: "fine" }, o.suggestedCodesNote)
        : null,
    ),
    // 3. Prior auth required
    section(
      "Prior authorization required",
      null,
      el(
        "p",
        {},
        el(
          "span",
          {
            class: `pill strong ${a.priorAuthRequired === "NO" ? "good" : "warn"}`,
          },
          pa.label,
        ),
      ),
      a.priorAuthRationale ? el("p", {}, a.priorAuthRationale) : null,
    ),
    // Medicare policies, when present, sit with the criteria they feed.
    a.medicarePolicies?.length
      ? section(
          "Medicare coverage policies",
          null,
          ...a.medicarePolicies.map((p) =>
            el(
              "div",
              {},
              el(
                "h3",
                {},
                `${p.type}${p.policyId ? ` ${p.policyId}` : ""} — ${p.title}`,
              ),
              p.contractor
                ? el("p", { class: "fine" }, `Contractor: ${p.contractor}`)
                : null,
              p.jurisdiction
                ? el("p", { class: "fine" }, `Jurisdiction: ${p.jurisdiction}`)
                : null,
              (() => {
                const url = policySourceUrl(p.type, p.policyId, p.url);
                return url
                  ? el("p", { class: "fine" }, "Source: ", sourceLink(url))
                  : null;
              })(),
              p.summary ? el("p", { class: "muted" }, p.summary) : null,
              p.criteria?.length
                ? el(
                    "ul",
                    { class: "criteria" },
                    ...p.criteria.map(criterionItem),
                  )
                : null,
            ),
          ),
        )
      : null,
    // 4. Criteria
    section(
      "Medical necessity criteria",
      `${cc.met} of ${cc.total} met`,
      a.medicalNecessityCriteria.length
        ? el(
            "ul",
            { class: "criteria" },
            ...a.medicalNecessityCriteria.map(criterionItem),
          )
        : el("p", { class: "muted" }, "None listed."),
    ),
    // 5. Codes
    section(
      "Codes",
      null,
      el(
        "div",
        { class: "codes-grid" },
        codeTable("CPT/HCPCS", a.relevantCodes.cpt, a.relevantCodes.cptNote),
        codeTable("ICD-10", a.relevantCodes.icd10, a.relevantCodes.icd10Note),
      ),
    ),
    // 6. Documentation
    section(
      "Required documentation",
      documentationCountText(a.requiredDocumentation),
      ...a.requiredDocumentation.map((g) =>
        el(
          "div",
          {},
          g.title ? el("h3", {}, g.title) : null,
          el(
            "ul",
            { class: "docs" },
            ...g.items.map((i) => docItem(i.item, i.provided)),
          ),
        ),
      ),
    ),
    a.review ? reviewSection(a.review) : null,
    // 7. Always visible, never collapsed.
    section("Limitations", null, list(a.limitations)),
    section("Missing items", null, list(a.summary.missingItems)),
    section("Disclaimer", null, el("p", { class: "muted" }, a.disclaimer)),
    actions(renderPriorAuthMarkdown(a)),
  );
}

/* ---------- bridge ---------- */

function isCurrentArtifact(v: unknown): v is PriorAuthArtifact {
  const a = v as { kind?: unknown; schemaVersion?: unknown } | null;
  return !!a && a.kind === "prior-auth-summary" && a.schemaVersion === 1;
}

function textBlocks(result: CallToolResult): string[] {
  return (result.content ?? []).flatMap((c) =>
    c.type === "text" ? [c.text] : [],
  );
}

function handleResult(result: CallToolResult): void {
  const texts = textBlocks(result);
  if (result.isError) {
    renderError(texts.join("\n") || "The screening did not complete.");
    return;
  }
  const artifact = (
    result.structuredContent as { artifact?: unknown } | undefined
  )?.artifact;
  if (isCurrentArtifact(artifact)) {
    try {
      renderReport(artifact);
      return;
    } catch (e) {
      console.error("[notedoctor] report render failed", e);
    }
  }
  // content[1] is the server's markdown; content[0] is the legacy JSON.
  renderFallback(texts[1] ?? texts[0] ?? "No report was returned.");
}

renderLoading();

const app = new App({ name: "NoteDoctor prior auth report", version: "1.0.0" });
app.ontoolinput = () => renderLoading();
app.ontoolresult = (result) => handleResult(result as CallToolResult);
app.ontoolcancelled = () =>
  renderError("The screening was cancelled before it finished.");
app.connect().catch((e) => {
  console.error("[notedoctor] host bridge failed", e);
  renderError("Could not connect to the host to receive the report.");
});
