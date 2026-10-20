import {
  ARTIFACT_JSON_EXAMPLE,
  type PriorAuthArtifact,
} from "../artifactSchema";
import {
  documentationCountText,
  criteriaCounts,
  documentationCounts,
  renderPriorAuthMarkdown,
} from "../renderPriorAuthMarkdown";

const example = (): PriorAuthArtifact =>
  JSON.parse(ARTIFACT_JSON_EXAMPLE) as PriorAuthArtifact;

describe("renderPriorAuthMarkdown", () => {
  it("includes every criterion, sub-criterion, code, doc item and limitation", () => {
    const a = example();
    const md = renderPriorAuthMarkdown(a);

    const criteria = (
      cs: PriorAuthArtifact["medicalNecessityCriteria"],
    ): string[] =>
      cs.flatMap((c) => [
        c.title,
        ...(c.detail ? [c.detail] : []),
        ...criteria(c.subCriteria ?? []),
      ]);
    for (const s of criteria(a.medicalNecessityCriteria))
      expect(md).toContain(s);
    for (const c of [...a.relevantCodes.cpt, ...a.relevantCodes.icd10]) {
      expect(md).toContain(`| ${c.code} | ${c.label}`);
    }
    for (const i of a.requiredDocumentation.flatMap((g) => g.items)) {
      expect(md).toContain(i.item);
    }
    for (const l of a.limitations) expect(md).toContain(l);
    for (const m of a.summary.missingItems) expect(md).toContain(`- ${m}`);
    for (const p of a.medicarePolicies ?? []) expect(md).toContain(p.title);
    expect(md).toContain(a.disclaimer);
    expect(md).toContain(a.summary.determinationLabel);
    if (a.relevantCodes.icd10Note)
      expect(md).toContain(a.relevantCodes.icd10Note);
  });

  it("renders sections in report order", () => {
    const md = renderPriorAuthMarkdown(example());
    const order = [
      "## Request overview",
      "## Prior authorization required",
      "## Medical necessity criteria",
      "## Codes",
      "## Required documentation",
      "## Limitations",
      "## Missing items",
      "## Disclaimer",
    ].map((h) => md.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it("nests sub-criteria with statuses and counts top-level met criteria", () => {
    const a = example();
    a.medicalNecessityCriteria = [
      {
        title: "Parent",
        status: "met",
        subCriteria: [
          { title: "Child", status: "not_met", detail: "line one\nline two" },
        ],
      },
      { title: "Other", status: "unknown" },
    ];
    const md = renderPriorAuthMarkdown(a);
    expect(md).toContain("1 of 2 met");
    expect(md).toContain("- **Parent** — Met");
    expect(md).toContain("  - **Child** — Not met\n    line one line two");
    expect(md).toContain("- **Other** — Unknown");
  });

  it("marks documentation provided vs missing with a count", () => {
    const a = example();
    a.requiredDocumentation = [
      {
        title: "Group",
        items: [
          { item: "Have", provided: true },
          { item: "Need", provided: null },
        ],
      },
      { items: [{ item: "Ungrouped", provided: false }] },
    ];
    const md = renderPriorAuthMarkdown(a);
    // null means "could not tell", not "missing".
    expect(md).toContain("1 of 3 provided · 1 missing · 1 not confirmed");
    expect(md).toContain("### Group");
    expect(md).toContain("- [x] Have — Provided");
    expect(md).toContain("- [ ] Need — _Not confirmed_");
    expect(md).toContain("- [ ] Ungrouped — **Missing**");
  });

  it("escapes table cells and handles empty lists and notices", () => {
    const a = example();
    a.relevantCodes = {
      cpt: [{ code: "1|2", label: "a\nb", note: "careful" }],
      icd10: [],
    };
    a.limitations = [];
    a.summary.missingItems = [];
    a.requestOverview.cpt = [{ code: "99213", label: "Office visit" }];
    a.phiNotice = "PHI removed";
    a.fallbackNotice = "Commercial fallback used";
    a.medicarePolicies = undefined;
    a.priorAuthRationale = undefined;
    const md = renderPriorAuthMarkdown(a);
    expect(md).toContain("| 1\\|2 | a b — _careful_ |");
    expect(md).toContain("### ICD-10\n\n_None listed._");
    expect(md).toContain("## Limitations\n\n_None listed._");
    expect(md).toContain("**Submitted CPT/HCPCS:** 99213 (Office visit)");
    expect(md).toContain("> PHI removed");
    expect(md).toContain("> Commercial fallback used");
    expect(md).not.toContain("Medicare coverage policies");
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("is deterministic", () => {
    expect(renderPriorAuthMarkdown(example())).toBe(
      renderPriorAuthMarkdown(example()),
    );
  });
});

describe("counts", () => {
  it("counts empty input as zero", () => {
    expect(criteriaCounts([])).toEqual({ met: 0, total: 0 });
    expect(documentationCounts([])).toEqual({
      provided: 0,
      missing: 0,
      unconfirmed: 0,
      total: 0,
    });
  });
});

describe("labels follow the returned data", () => {
  it("states prior-auth status once, without echoing the raw enum", () => {
    for (const [value, label] of [
      ["YES", "Required"],
      ["NO", "Not required"],
      ["CONDITIONAL", "Conditional"],
    ] as const) {
      const a = example();
      a.priorAuthRequired = value;
      const md = renderPriorAuthMarkdown(a);
      expect(md).toContain(`**Status:** ${label}`);
      expect(md).not.toContain(`**${value}**`);
    }
  });

  it("keeps the exact determination when the agent's phrase does not name it", () => {
    const a = example();
    a.summary.determination = "not_supported";
    a.summary.determinationLabel =
      "Likely not medically necessary as submitted";
    expect(renderPriorAuthMarkdown(a)).toContain(
      "**Determination:** Not supported — Likely not medically necessary as submitted",
    );

    a.summary.determination = "conditional";
    a.summary.determinationLabel =
      "Conditional — additional documentation needed";
    expect(renderPriorAuthMarkdown(a)).toContain(
      "**Determination:** Conditional — additional documentation needed\n",
    );
  });

  it("keeps notes on submitted codes", () => {
    const a = example();
    a.requestOverview.icd10 = [
      { code: "M54.2", label: "Cervicalgia", note: "symptom code" },
    ];
    expect(renderPriorAuthMarkdown(a)).toContain(
      "**Submitted ICD-10:** M54.2 (Cervicalgia — symptom code)",
    );
  });

  it("renders the automated review: findings, omitted, unrun checks and repairs", () => {
    const a = example();
    a.review = {
      v: 1,
      issues: [
        {
          code: "code-not-in-evidence",
          severity: "warning",
          checkId: "code-grounding",
          path: "relevantCodes.cpt[0].code",
          label: "Relevant Codes → CPT / HCPCS",
          message: "This code was not found in the retrieved sources.",
        },
      ],
      checks: [
        {
          id: "code-grounding",
          status: "partial",
          reason: "evidence-truncated",
          issueCount: 1,
        },
        { id: "structure", status: "skipped", issueCount: 0 },
      ],
      repairs: [{ path: "relevantCodes.icd10", kind: "code-backfill" }],
      omittedCount: 2,
    };
    const md = renderPriorAuthMarkdown(a);
    expect(md).toContain("## Automated review\n\n**1 item needs review**");
    expect(md).toContain(
      "- **Warning** · Relevant Codes → CPT / HCPCS — This code was not found in the retrieved sources. _(Not in sources)_",
    );
    expect(md).toContain("- …and 2 more not shown.");
    expect(md).toContain(
      "- Partly checked — code sources: the retrieved sources were too large to check in full.",
    );
    expect(md).toContain("- Not checked — report structure: did not run.");
    expect(md).toContain(
      "- 1 field was filled from the guideline before the checks ran.",
    );
    // Disclaimer stays last.
    expect(md.indexOf("## Automated review")).toBeLessThan(
      md.indexOf("## Disclaimer"),
    );
  });

  it("omits the review section for an artifact that was never reviewed", () => {
    expect(renderPriorAuthMarkdown(example())).not.toContain(
      "Automated review",
    );
  });

  it("drops zero tails from the documentation count", () => {
    expect(
      documentationCountText([{ items: [{ item: "a", provided: true }] }]),
    ).toBe("1 of 1 provided");
  });
});
