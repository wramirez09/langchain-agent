/** @jest-environment node */
import {
  normalizeCriterionStatuses,
  normalizeStatus,
} from "../normalizeStatuses";

describe("normalizeStatus", () => {
  it.each([
    ["met", "met"],
    ["Met", "met"],
    [" NOT MET ", "not_met"],
    ["not-met", "not_met"],
    ["partially_met", "unknown"],
    ["n/a", "unknown"],
    [42, "unknown"],
  ])("%p -> %p", (input, out) => {
    expect(normalizeStatus(input)).toBe(out);
  });

  it("leaves a missing status missing", () => {
    expect(normalizeStatus(undefined)).toBeUndefined();
  });
});

describe("normalizeCriterionStatuses", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("fixes nested and Medicare policy criteria without mutating input", () => {
    const input = {
      medicalNecessityCriteria: [
        { title: "a", status: "Met", subCriteria: [{ title: "b", status: "partial" }] },
      ],
      medicarePolicies: [{ title: "p", criteria: [{ title: "c", status: "covered" }] }],
    } as any;
    const out = normalizeCriterionStatuses(input);
    expect(out.medicalNecessityCriteria[0].status).toBe("met");
    expect(out.medicalNecessityCriteria[0].subCriteria[0].status).toBe("unknown");
    expect(out.medicarePolicies[0].criteria[0].status).toBe("met");
    expect(input.medicalNecessityCriteria[0].status).toBe("Met");
  });
});
