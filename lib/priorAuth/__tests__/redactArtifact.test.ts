import {
  ARTIFACT_JSON_EXAMPLE,
  type PriorAuthArtifact,
} from "../artifactSchema";
import { redactArtifact, redactText } from "../redactArtifact";

const example = (): PriorAuthArtifact =>
  JSON.parse(ARTIFACT_JSON_EXAMPLE) as PriorAuthArtifact;

describe("redactArtifact", () => {
  it("leaves a clean artifact byte-identical, codes and links included", () => {
    const a = example();
    const { artifact, total } = redactArtifact(a);
    expect(total).toBe(0);
    expect(artifact).toEqual(a);
    expect(artifact.phiNotice).toBeUndefined();
  });

  it("scrubs identifiers from every free-text field it reaches", () => {
    const a = example();
    a.title = "PA summary for Mr. Alvarez";
    a.requestOverview.medicalHistory =
      "Patient John Smith, DOB 03/14/1961, MRN 448812, seen 2026-09-02. Call 312-555-0199.";
    a.requestOverview.keyFindings = ["Seen at Mercy Hospital", "Pain 6 weeks"];
    a.medicalNecessityCriteria[0].subCriteria![0].detail =
      "Per Dr. Patel on 1/5/26";
    a.requiredDocumentation[0].items[0].item = "Email jane.doe@example.com";
    a.limitations = ["Contact 312-555-0199"];

    const { artifact, total } = redactArtifact(a);
    const json = JSON.stringify(artifact);
    for (const phi of [
      "Alvarez",
      "John Smith",
      "03/14/1961",
      "448812",
      "2026-09-02",
      "312-555-0199",
      "Mercy Hospital",
      "Patel",
      "1/5/26",
      "jane.doe@example.com",
    ]) {
      expect(json).not.toContain(phi);
    }
    expect(artifact.requestOverview.keyFindings[1]).toBe("Pain 6 weeks");
    expect(total).toBeGreaterThanOrEqual(10);
    // Counts only, never the removed text.
    expect(artifact.phiNotice).toBe(
      `${total} identifiers were removed from this report.`,
    );
  });

  it("never touches codes, policy ids, urls, enums or the review", () => {
    const a = example();
    a.relevantCodes.cpt = [{ code: "4488123", label: "Long code" }];
    a.medicarePolicies![0].url = "https://www.cms.gov/x?id=448812";
    a.medicarePolicies![0].policyId = "20260902";
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
      checks: [],
      repairs: [],
    };
    const { artifact } = redactArtifact(a);
    expect(artifact.relevantCodes.cpt[0].code).toBe("4488123");
    expect(artifact.medicarePolicies![0].url).toBe(
      "https://www.cms.gov/x?id=448812",
    );
    expect(artifact.medicarePolicies![0].policyId).toBe("20260902");
    expect(artifact.review).toEqual(a.review);
    expect(artifact.guidelineBasis).toBe("medicare");
  });

  it("keeps an existing PHI notice and appends the count", () => {
    const a = example();
    a.phiNotice = "Identifiers were stripped from the request.";
    a.requestOverview.medicalHistory = "Call 312-555-0199";
    expect(redactArtifact(a).artifact.phiNotice).toBe(
      "Identifiers were stripped from the request. 1 identifier was removed from this report.",
    );
  });

  it("does not mutate its input", () => {
    const a = example();
    a.requestOverview.medicalHistory = "Call 312-555-0199";
    redactArtifact(a);
    expect(a.requestOverview.medicalHistory).toBe("Call 312-555-0199");
  });
});

describe("redactText", () => {
  it("scrubs the plain-text fallback", () => {
    expect(redactText("Ask about Mr. Alvarez, seen 2026-09-02")).toBe(
      "Ask about Mr. [NAME], seen [DATE]",
    );
  });
});

describe("redactArtifact — echoed request fields", () => {
  it("removes a bare name the agent copied into the overview, keeps procedure names", () => {
    const a = example();
    a.requestOverview.diagnosis = "John Wayne";
    a.requestOverview.medicalHistory = "Seen with Smith for knee pain.";
    a.requestOverview.treatment =
      "Magnetic Resonance Imaging (MRI) of the knee";
    const { artifact } = redactArtifact(a);
    expect(artifact.requestOverview.diagnosis).toBe("[NAME]");
    expect(artifact.requestOverview.medicalHistory).toBe(
      "Seen with [NAME] for knee pain.",
    );
    expect(artifact.requestOverview.treatment).toBe(
      a.requestOverview.treatment,
    );
  });

  it("uses the conservative rules outside the echo, so eponyms in criteria survive", () => {
    const a = example();
    a.medicalNecessityCriteria[0].detail = "Per guideline authored by Smith";
    expect(redactArtifact(a).artifact.medicalNecessityCriteria[0].detail).toBe(
      "Per guideline authored by Smith",
    );
  });

  it("scrubs a streaming partial without adding a receipt when asked", () => {
    const partial = { requestOverview: { diagnosis: "John Wayne" } };
    const { artifact, total } = redactArtifact(partial, { notice: false });
    expect(artifact).toEqual({ requestOverview: { diagnosis: "[NAME]" } });
    expect(total).toBe(1);
  });
});
