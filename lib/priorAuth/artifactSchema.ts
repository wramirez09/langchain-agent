import { z } from "zod";

/**
 * Prior-Authorization readiness artifact.
 *
 * The agent returns its FINAL answer as a single JSON object of this shape —
 * no prose, no markdown, no code fences. The chat client partial-parses the
 * streaming JSON and renders a skeleton + custom React components per section.
 *
 * `kind` + `schemaVersion` let the client distinguish this structured artifact
 * from a plain text/markdown assistant message and pick the right renderer.
 */

export const ARTIFACT_KIND = "prior-auth-summary" as const;
export const ARTIFACT_SCHEMA_VERSION = 1 as const;

export type PaDecision = "YES" | "NO" | "CONDITIONAL";

/**
 * Whether the submitted clinical record satisfies a criterion. Drives the
 * initial state of the interactive checkbox the reviewer can toggle.
 */
export type CriterionStatus = "met" | "not_met" | "unknown";

export type Determination =
  | "meets_criteria"
  | "conditional"
  | "likely_denial"
  | "not_supported"
  | "more_info_needed";

export type GuidelineBasis = "medicare" | "commercial" | "commercial-fallback";

export interface LabeledCode {
  /** e.g. "63045" or "M54.2" */
  code: string;
  /** official title; brief plain-language description */
  label: string;
  /** optional caveat, e.g. "presenting symptom code — generally insufficient alone" */
  note?: string;
}

export interface Criterion {
  /** short, scannable label */
  title: string;
  /** met / not_met / unknown given the submitted record */
  status: CriterionStatus;
  /** the criterion text VERBATIM from the guideline, including exact thresholds */
  detail?: string;
  /** nested qualifying scenarios, risk bands, special-population cases */
  subCriteria?: Criterion[];
}

export interface DocumentationItem {
  item: string;
  /** whether the submitted record already supplies this (null/undefined = unknown) */
  provided?: boolean | null;
}

/** A titled category of documentation, e.g. "Clinical Evaluation". */
export interface DocumentationGroup {
  /** category heading; omit (or leave empty) for ungrouped items */
  title?: string;
  items: DocumentationItem[];
}

export interface RequestOverview {
  treatment: string;
  /** plain-language diagnosis the request is filed under, e.g. "Knee pain > 4 weeks" */
  diagnosis?: string;
  /** codes the USER supplied; empty array => "Not provided" */
  cpt: LabeledCode[];
  icd10: LabeledCode[];
  /**
   * Candidate codes the guideline associates with the treatment when the user
   * supplied none — rendered as "Likely CPT/HCPCS options".
   */
  suggestedCpt?: LabeledCode[];
  suggestedIcd10?: LabeledCode[];
  medicalHistory: string;
  keyFindings: string[];
}

export interface RelevantCodes {
  icd10: LabeledCode[];
  /** free-text caveat under the ICD list, e.g. "Additional codes may apply if ..." */
  icd10Note?: string;
  cpt: LabeledCode[];
  cptNote?: string;
}

/**
 * A Medicare coverage policy. Populated when the user makes a Medicare request
 * and the agent retrieves coverage data: National Coverage Determinations (NCD),
 * Local Coverage Determinations (LCD), and Local Coverage Articles (LCA). The
 * client groups these by `type` into titled "National Coverage Determinations"
 * and "Local Coverage Determinations" sections.
 */
export interface CoveragePolicy {
  type: "NCD" | "LCD" | "LCA";
  /** policy/document id, e.g. "220.1" (NCD) or "L34567" (LCD) */
  policyId?: string;
  title: string;
  /** MAC / contractor name (LCD / LCA) */
  contractor?: string;
  /** jurisdiction / state(s) the policy applies to (LCD / LCA) */
  jurisdiction?: string;
  /** coverage summary or determination text */
  summary?: string;
  /** structured coverage criteria, verbatim from the policy */
  criteria?: Criterion[];
  /** CMS source URL */
  url?: string;
}

export interface DeterminationSummary {
  determination: Determination;
  /** human phrase, e.g. "Likely not medically necessary as submitted" */
  determinationLabel: string;
  rationale: string;
  /** items to add to strengthen the request */
  missingItems: string[];
}

export interface PriorAuthArtifact {
  kind: typeof ARTIFACT_KIND;
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  title: string;
  /** PHI-stripped note, present only if PHI was detected and removed */
  phiNotice?: string;
  guidelineBasis: GuidelineBasis;
  /** shown when commercial guidelines were used as a Medicare fallback */
  fallbackNotice?: string;
  requestOverview: RequestOverview;
  priorAuthRequired: PaDecision;
  priorAuthRationale?: string;
  /**
   * Structured Medicare coverage policies (NCD / LCD / LCA). Present only when
   * `guidelineBasis` is "medicare" and coverage data was retrieved; omit for
   * commercial responses.
   */
  medicarePolicies?: CoveragePolicy[];
  medicalNecessityCriteria: Criterion[];
  relevantCodes: RelevantCodes;
  /** documentation grouped into titled categories (e.g. "Clinical Evaluation") */
  requiredDocumentation: DocumentationGroup[];
  limitations: string[];
  summary: DeterminationSummary;
  disclaimer: string;
}

/**
 * Deep-partial view the streaming client renders against as the JSON fills in.
 * Every field may be absent or half-built mid-stream.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialPriorAuthArtifact = DeepPartial<PriorAuthArtifact>;

// ---------------------------------------------------------------------------
// Runtime schema — used to validate / "ensure" the model's completed output.
// ---------------------------------------------------------------------------

const labeledCodeSchema = z.object({
  code: z.string(),
  label: z.string(),
  note: z.string().optional(),
});

const criterionSchema: z.ZodType<Criterion> = z.lazy(() =>
  z.object({
    title: z.string(),
    status: z.enum(["met", "not_met", "unknown"]),
    detail: z.string().optional(),
    subCriteria: z.array(criterionSchema).optional(),
  }),
);

const coveragePolicySchema = z.object({
  type: z.enum(["NCD", "LCD", "LCA"]),
  policyId: z.string().optional(),
  title: z.string(),
  contractor: z.string().optional(),
  jurisdiction: z.string().optional(),
  summary: z.string().optional(),
  criteria: z.array(criterionSchema).optional(),
  url: z.string().optional(),
});

export const priorAuthArtifactSchema = z.object({
  kind: z.literal(ARTIFACT_KIND),
  schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
  title: z.string(),
  phiNotice: z.string().optional(),
  guidelineBasis: z.enum(["medicare", "commercial", "commercial-fallback"]),
  fallbackNotice: z.string().optional(),
  requestOverview: z.object({
    treatment: z.string(),
    diagnosis: z.string().optional(),
    cpt: z.array(labeledCodeSchema),
    icd10: z.array(labeledCodeSchema),
    suggestedCpt: z.array(labeledCodeSchema).optional(),
    suggestedIcd10: z.array(labeledCodeSchema).optional(),
    medicalHistory: z.string(),
    keyFindings: z.array(z.string()),
  }),
  priorAuthRequired: z.enum(["YES", "NO", "CONDITIONAL"]),
  priorAuthRationale: z.string().optional(),
  medicarePolicies: z.array(coveragePolicySchema).optional(),
  medicalNecessityCriteria: z.array(criterionSchema),
  relevantCodes: z.object({
    icd10: z.array(labeledCodeSchema),
    icd10Note: z.string().optional(),
    cpt: z.array(labeledCodeSchema),
    cptNote: z.string().optional(),
  }),
  requiredDocumentation: z.array(
    z.object({
      title: z.string().optional(),
      items: z.array(
        z.object({
          item: z.string(),
          provided: z.boolean().nullable().optional(),
        }),
      ),
    }),
  ),
  limitations: z.array(z.string()),
  summary: z.object({
    determination: z.enum([
      "meets_criteria",
      "conditional",
      "likely_denial",
      "not_supported",
      "more_info_needed",
    ]),
    determinationLabel: z.string(),
    rationale: z.string(),
    missingItems: z.array(z.string()),
  }),
  disclaimer: z.string(),
});

/** Lightweight discriminator check (cheaper than full Zod parse). */
export function isPriorAuthArtifact(v: unknown): v is PriorAuthArtifact {
  return (
    !!v &&
    typeof v === "object" &&
    (v as { kind?: unknown }).kind === ARTIFACT_KIND &&
    (v as { schemaVersion?: unknown }).schemaVersion === ARTIFACT_SCHEMA_VERSION
  );
}

/**
 * Canonical example embedded in the agent prompt to lock the output shape.
 * Illustrative Medicare MRI-of-the-knee request — exercises diagnosis,
 * suggestedCpt, medicarePolicies (NCD + LCD sections), grouped
 * requiredDocumentation, and code-list notes. Values are illustrative only.
 */
export const ARTIFACT_JSON_EXAMPLE = JSON.stringify(
  {
    kind: ARTIFACT_KIND,
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    title: "Prior Authorization Summary for MRI of the Knee",
    guidelineBasis: "medicare",
    requestOverview: {
      treatment: "Magnetic Resonance Imaging (MRI) of the knee",
      diagnosis: "Knee pain for more than 4 weeks",
      cpt: [],
      icd10: [],
      suggestedCpt: [
        { code: "73721", label: "MRI lower extremity joint without contrast" },
        { code: "73722", label: "MRI lower extremity joint with contrast" },
        { code: "73723", label: "MRI lower extremity joint without and with contrast" },
      ],
      medicalHistory: "Knee pain persisting for over 4 weeks.",
      keyFindings: [
        "Knee pain duration greater than 4 weeks",
        "No details on trauma, mechanical symptoms, instability, swelling, locking, prior imaging, or conservative treatment",
      ],
    },
    priorAuthRequired: "CONDITIONAL",
    priorAuthRationale:
      "MRI is advanced imaging that commonly requires prior authorization and must meet medical-necessity criteria.",
    medicarePolicies: [
      {
        type: "NCD",
        policyId: "220.2",
        title: "Magnetic Resonance Imaging (NCD 220.2)",
        summary: "MRI is covered when reasonable and necessary for the diagnosis or treatment of the condition.",
        criteria: [
          {
            title: "Reasonable and necessary",
            status: "unknown",
            detail: "The study must be reasonable and necessary for the diagnosis or treatment of the condition.",
          },
        ],
      },
      {
        type: "LCD",
        policyId: "L00000",
        title: "MRI of the Lower Extremity — Local Coverage Determination",
        contractor: "Medicare Administrative Contractor (as applicable)",
        jurisdiction: "Applicable jurisdiction / state(s)",
        summary: "Knee MRI is covered when conservative therapy has failed and/or internal derangement is clinically suspected with correlating findings.",
        criteria: [
          {
            title: "Failed conservative management",
            status: "unknown",
            detail: "Persistent symptoms despite conservative care, commonly at least 4 to 6 weeks.",
          },
          {
            title: "Suspected internal derangement",
            status: "unknown",
            detail: "Clinical concern for meniscal tear, ligament injury, osteochondral injury, loose body, or mechanical symptoms.",
          },
        ],
      },
    ],
    medicalNecessityCriteria: [
      {
        title: "Persistent pain after conservative management",
        status: "unknown",
        detail: "MRI may be medically necessary when knee pain persists despite an adequate trial of conservative treatment.",
        subCriteria: [
          {
            title: "Conservative measures",
            status: "unknown",
            detail: "Activity modification; rest/reduced weight-bearing; NSAIDs unless contraindicated; physical therapy or home exercise; bracing/compression.",
          },
          {
            title: "Duration",
            status: "unknown",
            detail: "Symptoms persisting despite conservative care, commonly for at least 4 to 6 weeks.",
          },
        ],
      },
      {
        title: "Prior imaging requirement",
        status: "unknown",
        detail: "Plain radiographs that are nondiagnostic or do not explain symptoms, correlating with the clinical concern.",
      },
      {
        title: "Suspected internal derangement",
        status: "unknown",
        detail: "Meniscal tear; ACL/PCL/MCL/LCL injury; osteochondral injury; loose body; tendon injury; persistent effusion; mechanical symptoms (locking, catching, giving way).",
      },
      {
        title: "Red flag or urgent indications",
        status: "unknown",
        detail: "May be supported without a prolonged conservative trial when there is concern for infection, tumor, occult fracture, osteonecrosis, or neurologic/vascular compromise.",
      },
    ],
    relevantCodes: {
      icd10: [
        { code: "M25.561", label: "Pain in right knee" },
        { code: "M25.562", label: "Pain in left knee" },
        { code: "M25.569", label: "Pain in unspecified knee" },
      ],
      icd10Note: "Additional ICD-10 codes may apply for suspected meniscal tear, ligament injury, effusion, osteoarthritis, fracture, or internal derangement.",
      cpt: [
        { code: "73721", label: "MRI lower extremity joint without contrast" },
        { code: "73722", label: "MRI lower extremity joint with contrast" },
        { code: "73723", label: "MRI lower extremity joint without and with contrast" },
      ],
    },
    requiredDocumentation: [
      {
        title: "Clinical Evaluation",
        items: [
          { item: "History and duration of knee pain" },
          { item: "Laterality: right, left, or bilateral" },
          { item: "Physical exam (ROM limits, tenderness, swelling/effusion, instability, locking/catching/giving way)" },
          { item: "Gait abnormality or functional impairment" },
        ],
      },
      {
        title: "Conservative Treatment",
        items: [
          { item: "Dates and duration of conservative treatment" },
          { item: "Medications tried (NSAIDs or analgesics)" },
          { item: "Physical therapy notes or physician-directed home exercise plan" },
          { item: "Response to treatment and reason symptoms remain unresolved" },
        ],
      },
      {
        title: "Prior Imaging",
        items: [
          { item: "Knee X-ray report, if performed" },
          { item: "Any prior ultrasound, CT, or MRI reports, if applicable" },
          { item: "Explanation of why MRI is needed after initial imaging" },
        ],
      },
      {
        title: "Clinical Rationale for MRI",
        items: [
          { item: "Suspected diagnosis being evaluated" },
          { item: "Why MRI results will affect treatment planning" },
        ],
      },
    ],
    limitations: [
      "Knee pain more than 4 weeks but no documented conservative treatment.",
      "No physical exam findings supporting internal derangement or structural pathology.",
      "No prior X-ray completed, unless there is a red flag or urgent indication.",
      "Imaging unlikely to change management.",
    ],
    summary: {
      determination: "more_info_needed",
      determinationLabel: "Conditional — additional documentation needed",
      rationale:
        "Knee pain lasting more than 4 weeks may support MRI, but coverage typically requires documentation of failed conservative treatment and/or prior knee X-rays.",
      missingItems: [
        "Knee pain duration and laterality",
        "Failed conservative care for at least 4 to 6 weeks",
        "Physical exam findings suggesting internal derangement",
        "X-ray results, if completed",
      ],
    },
    disclaimer:
      "This information is guidance only and does not guarantee approval. Final decisions rest with Medicare or the Medicare Advantage plan and the patient's specific plan criteria. Verify with the patient's MAC and the latest CMS publications. Based on available guideline information.",
  },
  null,
  2,
);
