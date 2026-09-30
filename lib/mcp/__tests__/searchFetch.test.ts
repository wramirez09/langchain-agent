/**
 * @jest-environment node
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import type { McpAuthContext } from "../auth";

const ncdInvoke = jest.fn();
const guidelineInvoke = jest.fn();
const detailInvoke = jest.fn();
const maybeSingle = jest.fn();

jest.mock("@/app/api/chat/agents/tools/NCDCoverageSearchTool", () => ({
  NCDCoverageSearchTool: class {
    invoke = (a: unknown) => ncdInvoke(a);
  },
}));
jest.mock("@/app/api/chat/agents/tools/CommercialGuidelineSearchTool", () => ({
  createCommercialGuidelineSearchTool: () => ({
    invoke: (a: unknown) => guidelineInvoke(a),
  }),
}));
jest.mock("@/app/api/chat/agents/tools/medicarePolicyDetailTool", () => ({
  medicarePolicyDetailTool: { invoke: (a: unknown) => detailInvoke(a) },
}));
jest.mock("@/app/api/chat/agents/tools/utils/excerpt", () => ({
  selectRelevantExcerpt: (body: string, _q: string, max: number) =>
    body.slice(0, max),
}));
jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }),
    }),
  },
}));

import {
  medicareUrl,
  parseDocId,
  registerSearchFetchTools,
  toSearchResults,
} from "../tools/searchFetch";

const auth: McpAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: null,
  oauthClientId: "c1",
  environment: "live",
  scopes: ["agents", "chat"],
  tier: "standard",
};

const ncdOut = JSON.stringify({
  topMatches: [
    { title: "Cardiac Rehab", documentId: "20.10", documentVersion: 3 },
    { title: "No version", documentId: "1" },
  ],
});
const guidelineOut = JSON.stringify({
  topMatches: [
    { id: "cardio-echo", title: "Echocardiography" },
    { title: "no id" },
  ],
});

describe("parseDocId", () => {
  it("round-trips every id kind search mints", () => {
    expect(parseDocId("ncd:20.10:3")).toEqual({
      kind: "medicare",
      documentType: "ncd",
      documentId: "20.10",
      documentVersion: 3,
    });
    expect(parseDocId("lcd:L33252:41")?.kind).toBe("medicare");
    expect(parseDocId("article:A56789:7")?.kind).toBe("medicare");
    expect(parseDocId("guideline:cardio-echo")).toEqual({
      kind: "guideline",
      corpusId: "cardio-echo",
    });
  });

  it.each([
    "",
    "ncd:1",
    "ncd:1:x",
    "pdf:1:2",
    "guideline:",
    "guideline:a b",
    "https://x",
  ])("rejects %p", (id) => expect(parseDocId(id)).toBeNull());
});

describe("medicareUrl", () => {
  it("links each document type to its MCD page", () => {
    expect(medicareUrl("ncd", "20.10", 3)).toBe(
      "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=20.10&ncdver=3",
    );
    expect(medicareUrl("lcd", "L1", 2)).toContain("lcd.aspx?lcdid=L1&ver=2");
    expect(medicareUrl("article", "A1", 2)).toContain(
      "article.aspx?articleid=A1&ver=2",
    );
  });
});

describe("toSearchResults", () => {
  it("interleaves sources and drops matches it could not fetch later", () => {
    expect(toSearchResults(ncdOut, guidelineOut)).toEqual([
      {
        id: "ncd:20.10:3",
        title: "Cardiac Rehab",
        url: "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=20.10&ncdver=3",
      },
      { id: "guideline:cardio-echo", title: "Echocardiography" },
    ]);
  });

  it("survives a failed or unparseable source", () => {
    expect(toSearchResults(null, "not json")).toEqual([]);
  });
});

describe("tools", () => {
  let client: Client;
  let metered: string[];

  beforeEach(async () => {
    [ncdInvoke, guidelineInvoke, detailInvoke, maybeSingle].forEach((m) =>
      m.mockReset(),
    );
    delete process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
    metered = [];
    const server = new McpServer({ name: "t", version: "0.0.0" });
    registerSearchFetchTools(server, { auth, meter: (t) => metered.push(t) });
    const [c, s] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "harness", version: "1.0.0" });
    await Promise.all([server.connect(s), client.connect(c)]);
  });

  it("are both read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["fetch", "search"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("search returns results as structured content and text, and meters once", async () => {
    ncdInvoke.mockResolvedValue(ncdOut);
    guidelineInvoke.mockResolvedValue(guidelineOut);

    const res: any = await client.callTool({
      name: "search",
      arguments: { query: "echo" },
    });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent.results).toHaveLength(2);
    expect(JSON.parse(res.content[0].text)).toEqual(res.structuredContent);
    expect(metered).toEqual(["mcp_tool"]);
  });

  it("search still answers when one source fails", async () => {
    ncdInvoke.mockRejectedValue(new Error("cms down"));
    guidelineInvoke.mockResolvedValue(guidelineOut);
    const res: any = await client.callTool({
      name: "search",
      arguments: { query: "echo" },
    });
    expect(res.structuredContent.results).toEqual([
      { id: "guideline:cardio-echo", title: "Echocardiography" },
    ]);
  });

  it("search errors, unbilled, when every source fails", async () => {
    ncdInvoke.mockRejectedValue(new Error("x"));
    guidelineInvoke.mockRejectedValue(new Error("y"));
    const res: any = await client.callTool({
      name: "search",
      arguments: { query: "echo" },
    });
    expect(res.isError).toBe(true);
    expect(metered).toEqual([]);
  });

  it("fetch resolves a Medicare id through the CMS detail tool", async () => {
    detailInvoke.mockResolvedValue(
      JSON.stringify({ title: "Cardiac Rehab", summary: "s" }),
    );

    const res: any = await client.callTool({
      name: "fetch",
      arguments: { id: "ncd:20.10:3" },
    });

    expect(detailInvoke).toHaveBeenCalledWith({
      documentType: "ncd",
      documentId: "20.10",
      documentVersion: 3,
    });
    expect(res.structuredContent).toMatchObject({
      id: "ncd:20.10:3",
      title: "Cardiac Rehab",
      url: expect.stringContaining("ncdid=20.10"),
    });
    expect(metered).toEqual(["mcp_tool"]);
  });

  it("fetch surfaces a CMS error as a tool error, unbilled", async () => {
    detailInvoke.mockResolvedValue(JSON.stringify({ error: "not found" }));
    const res: any = await client.callTool({
      name: "fetch",
      arguments: { id: "lcd:L1:2" },
    });
    expect(res.isError).toBe(true);
    expect(metered).toEqual([]);
  });

  it("fetch returns only an excerpt of a guideline body while resources are off", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "g",
        title: "Echo",
        domain: "cardio",
        body: "x".repeat(5000),
        procedures: [],
        cpt_codes: ["93306"],
      },
      error: null,
    });

    const res: any = await client.callTool({
      name: "fetch",
      arguments: { id: "guideline:g" },
    });

    expect(res.structuredContent.text.length).toBe(2000);
    expect(res.structuredContent.metadata).toMatchObject({
      excerptOnly: true,
      cptCodes: ["93306"],
    });
  });

  it("fetch returns the full guideline body when resources are enabled", async () => {
    process.env.MCP_EXPOSE_GUIDELINE_RESOURCES = "true";
    maybeSingle.mockResolvedValue({
      data: { id: "g", title: "Echo", body: "y".repeat(5000) },
      error: null,
    });
    const res: any = await client.callTool({
      name: "fetch",
      arguments: { id: "guideline:g" },
    });
    expect(res.structuredContent.text.length).toBe(5000);
  });

  it.each([
    ["an unknown id", "nope", undefined],
    ["a missing guideline", "guideline:g", { data: null, error: null }],
    ["a corpus error", "guideline:g", { data: null, error: { message: "x" } }],
  ])("fetch errors on %s", async (_l, id, row) => {
    if (row) maybeSingle.mockResolvedValue(row);
    const res: any = await client.callTool({
      name: "fetch",
      arguments: { id },
    });
    expect(res.isError).toBe(true);
    expect(metered).toEqual([]);
  });
});
