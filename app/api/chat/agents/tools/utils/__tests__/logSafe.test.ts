/**
 * @jest-environment node
 */
import { logSafeInput, logSafeText } from "../logSafe";

describe("logSafeInput", () => {
  it("replaces free text with its length and keeps the structural fields", () => {
    const out = logSafeInput({
      query: "knee pain after fall",
      treatment: "MRI lumbar spine",
      diagnosis: "M54.16",
      state: "Illinois",
      cpt: ["72148"],
      maxResults: 10,
    });

    expect(out).toEqual({
      query: "<redacted:20 chars>",
      treatment: "<redacted:16 chars>",
      diagnosis: "<redacted:6 chars>",
      state: "Illinois",
      cpt: ["72148"],
      maxResults: 10,
    });
  });

  it("never emits the original prose, even in a serialized log line", () => {
    const line = JSON.stringify(logSafeInput({ query: "Jane Doe DOB 1970-01-01 knee MRI" }));
    expect(line).not.toContain("Jane");
    expect(line).not.toContain("1970");
  });

  it("leaves absent fields absent rather than inventing redactions", () => {
    expect(logSafeInput({ state: "Ohio" })).toEqual({ state: "Ohio" });
  });

  it("does not mutate its input", () => {
    const input = { query: "abc" };
    logSafeInput(input);
    expect(input.query).toBe("abc");
  });

  it("redacts a non-string free-text field without leaking its contents", () => {
    expect(logSafeInput({ query: { nested: "secret" } })).toEqual({ query: "<redacted>" });
  });
});

describe("logSafeText", () => {
  it("reduces a value to its length", () => {
    expect(logSafeText("knee pain")).toBe("<redacted:9 chars>");
    expect(logSafeText(undefined)).toBe("<redacted>");
  });
});
