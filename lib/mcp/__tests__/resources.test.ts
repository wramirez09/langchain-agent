/**
 * @jest-environment node
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";
import { cache } from "@/lib/cache";

const selectMock = jest.fn();
const bodiesMock = jest.fn();

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: () => ({ select: () => selectMock() }) },
}));
jest.mock("@/lib/priorAuth/review/sourceBodies", () => ({
  fetchCommercialBodies: (...a: any[]) => bodiesMock(...a),
}));

import { registerGuidelineResources } from "../resources/guidelines";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes: ["agents", "chat"],
  tier: "standard",
};

const ROWS = [
  { id: "cardio-afib", title: "Atrial Fibrillation", domain: "cardio" },
  { id: "msk-knee-mri", title: "Knee MRI", domain: "msk" },
  { id: "no-domain", title: "Uncategorised", domain: null },
];

let server: McpServer;
let client: Client;
let metered: string[];

async function connect(): Promise<void> {
  metered = [];
  server = new McpServer({ name: "test", version: "0.0.0" });
  registerGuidelineResources(server, { auth, meter: (t) => metered.push(t) });
  const [c, s] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "harness", version: "1.0.0" });
  await Promise.all([server.connect(s), client.connect(c)]);
}

beforeEach(() => {
  cache.clear();
  selectMock.mockReset();
  bodiesMock.mockReset();
  selectMock.mockReturnValue({ order: () => Promise.resolve({ data: ROWS, error: null }) });
});

afterEach(async () => {
  await client?.close();
  await server?.close();
  delete process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
});

describe("with the flag off", () => {
  it("registers nothing and never touches the corpus", async () => {
    delete process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
    await connect();
    const { resources } = await client.listResources();
    expect(resources).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });
});

describe("with the flag on", () => {
  beforeEach(() => {
    process.env.MCP_EXPOSE_GUIDELINE_RESOURCES = "true";
  });

  it("lists one URI per document, carrying no paths or filenames", async () => {
    await connect();
    const { resources } = await client.listResources();
    const guidelines = resources.filter((r) => r.uri.startsWith("notedoctor://guideline/"));

    expect(guidelines).toHaveLength(ROWS.length);
    for (const r of guidelines) {
      const id = r.uri.replace("notedoctor://guideline/", "");
      // The id is the corpus id, never a path: `redactResult` strips folder
      // and file names from search output and the URI must not reintroduce them.
      expect(id).not.toContain("/");
      expect(id).not.toContain(".md");
    }
    expect(guidelines.map((r) => r.uri)).toContain("notedoctor://guideline/cardio-afib");
  });

  it("publishes a manifest so a client can orient without listing everything", async () => {
    await connect();
    const result = await client.readResource({ uri: "notedoctor://corpus/manifest" });
    const manifest = result.contents[0] as { text: string };
    expect(JSON.parse(manifest.text)).toEqual({
      count: 3,
      domains: ["cardio", "msk"],
    });
    expect(metered).toEqual(["mcp_resource"]);
  });

  it("reads one guideline body from the database and meters the read", async () => {
    bodiesMock.mockResolvedValue(new Map([["cardio-afib", "# Atrial Fibrillation\n\nCriteria…"]]));
    await connect();

    const result = await client.readResource({ uri: "notedoctor://guideline/cardio-afib" });

    const doc = result.contents[0] as { text: string; mimeType?: string };
    expect(bodiesMock).toHaveBeenCalledWith(["cardio-afib"]);
    expect(doc.text).toContain("Atrial Fibrillation");
    expect(doc.mimeType).toBe("text/markdown");
    expect(metered).toEqual(["mcp_resource"]);
  });

  it("refuses an unknown id instead of reaching for a file, and bills nothing", async () => {
    bodiesMock.mockResolvedValue(new Map());
    await connect();

    await expect(
      client.readResource({ uri: "notedoctor://guideline/does-not-exist" }),
    ).rejects.toThrow();
    expect(metered).toEqual([]);
  });

  it("survives a corpus index it cannot read", async () => {
    selectMock.mockReturnValue({
      order: () => Promise.resolve({ data: null, error: { message: "down" } }),
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await connect();

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(["notedoctor://corpus/manifest"]);
    warn.mockRestore();
  });
});
