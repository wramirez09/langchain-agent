/** @jest-environment node */

const getUserMock = jest.fn();
const extractMock = jest.fn();
const reportUsageMock = jest.fn();
const countMock = jest.fn();

jest.mock("@/lib/auth/getUserFromRequest", () => ({
  getUserFromRequest: (...a: unknown[]) => getUserMock(...a),
}));
jest.mock("@/lib/noteIngest/extractFields", () => ({
  extractQueryFields: (...a: unknown[]) => extractMock(...a),
}));
jest.mock("@/lib/usage", () => ({
  reportUsage: (...a: unknown[]) => reportUsageMock(...a),
}));
jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ gte: (...a: unknown[]) => countMock(...a) }),
        }),
      }),
    }),
  },
}));

import { POST } from "../route";

const FIELDS = {
  guidelines: "Commercial",
  state: "Texas",
  treatment: "lumbar fusion L4-L5",
  cptCodes: "22633",
  diagnosis: "lumbar spinal stenosis (M48.06)",
  patientHistory: "failed PT x8 weeks",
  relevantHistory: "no prior lumbar surgery",
};

const post = (body: unknown, init: RequestInit = {}) =>
  POST(
    new Request("http://localhost/api/notes/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }) as never,
  );

const CLEAN_NOTE =
  "Patient: [NAME] DOB: [DOB]. 68F with 6 months of low back pain. Failed PT x8 weeks. Dx M48.06. CPT 22633. Aetna. Texas.";

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  extractMock
    .mockReset()
    .mockResolvedValue({ fields: FIELDS, usedModel: true });
  reportUsageMock.mockReset().mockResolvedValue(null);
  countMock.mockReset().mockResolvedValue({ count: 0, error: null });
});

describe("POST /api/notes/extract — auth", () => {
  it("401s with no user", async () => {
    getUserMock.mockResolvedValue(null);
    expect((await post({ text: CLEAN_NOTE })).status).toBe(401);
  });

  it("401s when auth throws", async () => {
    getUserMock.mockRejectedValue(new Error("no session"));
    expect((await post({ text: CLEAN_NOTE })).status).toBe(401);
  });

  it("never runs extraction for an unauthenticated caller", async () => {
    getUserMock.mockResolvedValue(null);
    await post({ text: CLEAN_NOTE });
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/notes/extract — validation", () => {
  it("400s on malformed JSON", async () => {
    expect((await post("{not json")).status).toBe(400);
  });

  it("400s on a missing or empty note", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ text: "" })).status).toBe(400);
  });

  it("400s on a note over the size cap", async () => {
    expect((await post({ text: "a".repeat(50_001) })).status).toBe(400);
  });

  /** A validation error must not hand the note back to the caller. */
  it("reports field paths only, never the submitted value", async () => {
    const res = await post({ text: "", sourceKind: "bogus" });
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST_BODY");
    expect(JSON.stringify(body)).not.toContain("bogus");
  });
});

describe("POST /api/notes/extract — the tripwire", () => {
  it("422s when an identifier survived client-side redaction", async () => {
    const res = await post({ text: "Call 555-123-4567 re: SSN 123-45-6789" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("PHI_DETECTED");
    expect(body.categories).toMatchObject({ ssn: 1, phone: 1 });
  });

  /**
   * The whole point of the tripwire is to stop PHI reaching OpenAI, so it has
   * to short-circuit before extraction, not alongside it.
   */
  it("blocks before extraction runs", async () => {
    await post({ text: "SSN 123-45-6789" });
    expect(extractMock).not.toHaveBeenCalled();
    expect(reportUsageMock).not.toHaveBeenCalled();
  });

  it("returns counts only, never the matched text", async () => {
    const res = await post({ text: "jane.doe@example.com and 123-45-6789" });
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/jane|example|123-45-6789/);
  });

  it("lets a properly redacted note through", async () => {
    expect((await post({ text: CLEAN_NOTE })).status).toBe(200);
  });

  it("does not block on low-confidence residue alone", async () => {
    const res = await post({
      text: `${CLEAN_NOTE} See www.example.com/policy`,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).residue).toMatchObject({ url: 1 });
  });
});

describe("POST /api/notes/extract — success", () => {
  it("returns a query serialized like the form's", async () => {
    const res = await post({
      text: CLEAN_NOTE,
      sourceKind: "pdf",
      redactionCount: 14,
    });
    const body = await res.json();
    expect(body.query).toContain("Guidelines: Commercial");
    expect(body.query).toContain("State: Texas");
    expect(body.query).toContain("CPT/HCPCS : 22633");
    expect(body.query).toContain(
      "De-identification: 14 identifiers removed from an uploaded PDF",
    );
    expect(body.fields).toEqual(FIELDS);
    expect(body.usedModel).toBe(true);
  });

  it("singularizes the receipt and labels the source", async () => {
    const res = await post({
      text: CLEAN_NOTE,
      sourceKind: "paste",
      redactionCount: 1,
    });
    expect((await res.json()).query).toContain(
      "De-identification: 1 identifier removed from pasted text",
    );
  });

  it("meters note_extract separately from the screening", async () => {
    await post({ text: CLEAN_NOTE });
    expect(reportUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        usageType: "note_extract",
        quantity: 1,
      }),
    );
  });

  it("sets no-store on every response", async () => {
    const res = await post({ text: CLEAN_NOTE });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("422s when nothing could be extracted", async () => {
    extractMock.mockResolvedValue({
      fields: {
        guidelines: "",
        state: "",
        treatment: "",
        cptCodes: "",
        diagnosis: "",
        patientHistory: "",
        relevantHistory: "",
      },
      usedModel: false,
    });
    const res = await post({ text: CLEAN_NOTE, redactionCount: 0 });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("NO_FIELDS_EXTRACTED");
  });

  it("502s when extraction throws, without leaking the reason", async () => {
    extractMock.mockRejectedValue(new Error("openai exploded on Jane Doe"));
    const res = await post({ text: CLEAN_NOTE });
    expect(res.status).toBe(502);
    const raw = JSON.stringify(await res.json());
    expect(raw).toBe('{"error":"EXTRACTION_FAILED"}');
  });
});

describe("POST /api/notes/extract — rate limit", () => {
  it("429s over the daily cap", async () => {
    countMock.mockResolvedValue({ count: 200, error: null });
    const res = await post({ text: CLEAN_NOTE });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("fails open when the counter query errors", async () => {
    countMock.mockResolvedValue({ count: null, error: new Error("db down") });
    expect((await post({ text: CLEAN_NOTE })).status).toBe(200);
  });
});
