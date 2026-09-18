/**
 * @jest-environment node
 */
import {
  MAX_TOOL_TEXT_CHARS,
  normalizeToolText,
  truncateForClient,
} from "../limits";

const filler = (n: number) => "x".repeat(n);

describe("truncateForClient", () => {
  it("passes text under the cap through untouched", () => {
    const text = JSON.stringify({ topMatches: [1, 2, 3] });
    expect(truncateForClient(text)).toBe(text);
  });

  it("drops relatedMatches first and keeps valid JSON", () => {
    const payload = {
      topMatches: [{ id: "a", excerpt: filler(100) }],
      relatedMatches: [{ id: "b", excerpt: filler(500) }],
    };
    const out = truncateForClient(JSON.stringify(payload), 300);
    const parsed = JSON.parse(out);
    expect(parsed.relatedMatches).toBeUndefined();
    expect(parsed.topMatches).toHaveLength(1);
  });

  it("trims topMatches from the tail and records how many it dropped", () => {
    const payload = {
      topMatches: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, excerpt: filler(80) })),
    };
    const out = truncateForClient(JSON.stringify(payload), 300);
    const parsed = JSON.parse(out);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(parsed.topMatches.length).toBeGreaterThanOrEqual(1);
    expect(parsed.topMatches.length).toBeLessThan(6);
    expect(parsed.truncatedMatches).toBe(6 - parsed.topMatches.length);
    // Never emptied: one match is the difference between a thin answer and none.
    expect(parsed.topMatches[0].id).toBe("m0");
  });

  it("hard-truncates non-JSON with an explicit marker, under the cap", () => {
    const out = truncateForClient(filler(5_000), 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toMatch(/\[truncated: \d+ of 5000 chars omitted — narrow the query\]$/);
  });

  it("hard-truncates JSON that will not shrink far enough", () => {
    // No relatedMatches, no topMatches — nothing field-wise to give up.
    const out = truncateForClient(JSON.stringify({ body: filler(5_000) }), 400);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out).toContain("[truncated:");
  });

  it("defaults to the published cap", () => {
    expect(truncateForClient(filler(MAX_TOOL_TEXT_CHARS)).length).toBe(MAX_TOOL_TEXT_CHARS);
    expect(truncateForClient(filler(MAX_TOOL_TEXT_CHARS + 1)).length).toBeLessThanOrEqual(
      MAX_TOOL_TEXT_CHARS,
    );
  });
});

describe("normalizeToolText", () => {
  it("re-parses an array of JSON strings into one JSON array", () => {
    const members = [JSON.stringify({ policyUrl: "a" }), JSON.stringify({ policyUrl: "b" })];
    const out = normalizeToolText(JSON.stringify(members));
    expect(JSON.parse(out)).toEqual([{ policyUrl: "a" }, { policyUrl: "b" }]);
  });

  it("leaves a single JSON object alone", () => {
    const text = JSON.stringify({ policyUrl: "a" });
    expect(normalizeToolText(text)).toBe(text);
  });

  it("leaves an array of objects alone", () => {
    const text = JSON.stringify([{ a: 1 }]);
    expect(normalizeToolText(text)).toBe(text);
  });

  it("leaves non-JSON alone", () => {
    expect(normalizeToolText("not json")).toBe("not json");
  });

  it("keeps a member that is a plain string rather than JSON", () => {
    const out = normalizeToolText(JSON.stringify(["plain", JSON.stringify({ a: 1 })]));
    expect(JSON.parse(out)).toEqual(["plain", { a: 1 }]);
  });
});
