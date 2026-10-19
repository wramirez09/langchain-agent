/** @jest-environment node */

const getUserMock = jest.fn();
const loadMock = jest.fn();
const fromDocumentsMock = jest.fn();
const invokeMock = jest.fn();

jest.mock("@/lib/auth/getUserFromRequest", () => ({
  getUserFromRequest: (...a: unknown[]) => getUserMock(...a),
}));
jest.mock("@langchain/community/document_loaders/fs/pdf", () => ({
  PDFLoader: class {
    load = loadMock;
  },
}));
jest.mock("@langchain/community/vectorstores/supabase", () => ({
  SupabaseVectorStore: {
    fromDocuments: (...a: unknown[]) => fromDocumentsMock(...a),
  },
}));
jest.mock("@langchain/openai", () => ({ OpenAIEmbeddings: class {} }));
jest.mock("langchain/text_splitter", () => ({
  RecursiveCharacterTextSplitter: class {
    splitDocuments = (docs: unknown[]) => Promise.resolve(docs);
  },
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/llm", () => ({ llmAgent: () => ({ invoke: invokeMock }) }));

// The route throws at MODULE scope when its env vars are missing, and ES
// imports hoist above any assignment here -- so it has to be loaded lazily,
// after the environment is in place.
let POST: (req: never) => Promise<Response>;

beforeAll(async () => {
  process.env.SUPABASE_URL ||= "http://localhost";
  process.env.SUPABASE_PRIVATE_KEY ||= "key";
  process.env.OPENAI_API_KEY ||= "key";
  ({ POST } = await import("../route"));
});

function pdfRequest() {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  return new Request("http://localhost/api/retrieval/ingest", {
    method: "POST",
    body: form,
  }) as never;
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  loadMock.mockReset().mockResolvedValue([{ pageContent: "MRI lumbar spine" }]);
  fromDocumentsMock.mockReset().mockResolvedValue(undefined);
  invokeMock.mockReset().mockResolvedValue({ content: "a generated query" });
});

describe("POST /api/retrieval/ingest — auth", () => {
  /**
   * This route was anonymous and spent OpenAI tokens per call. It also writes
   * into a vector table with no tenant column, so an anonymous write was a
   * write into everyone's retrieval namespace.
   */
  it("401s with no session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await POST(pdfRequest());
    expect(res.status).toBe(401);
  });

  it("401s when auth throws", async () => {
    getUserMock.mockRejectedValue(new Error("no session"));
    expect((await POST(pdfRequest())).status).toBe(401);
  });

  it("spends no OpenAI tokens for an unauthenticated caller", async () => {
    getUserMock.mockResolvedValue(null);
    await POST(pdfRequest());
    expect(loadMock).not.toHaveBeenCalled();
    expect(fromDocumentsMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("still serves an authenticated caller", async () => {
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).generatedQuery).toBe("a generated query");
  });
});

describe("POST /api/retrieval/ingest — tenancy", () => {
  /**
   * `documents.user_id` is NOT NULL and lifted from metadata by a trigger, so
   * an unstamped chunk fails the insert outright. Stamping here is what keeps
   * the upload working AND keeps the row out of everyone else's namespace.
   */
  it("stamps the owner onto every chunk it embeds", async () => {
    loadMock.mockResolvedValue([
      { pageContent: "chunk one", metadata: { source: "a.pdf" } },
      { pageContent: "chunk two", metadata: { source: "a.pdf" } },
    ]);
    await POST(pdfRequest());

    const [docs] = fromDocumentsMock.mock.calls[0];
    expect(docs).toHaveLength(2);
    for (const d of docs) {
      expect(d.metadata.user_id).toBe("user-1");
      expect(d.metadata.source).toBe("a.pdf");
    }
  });

  it("writes to the documents table", async () => {
    await POST(pdfRequest());
    const [, , opts] = fromDocumentsMock.mock.calls[0];
    expect(opts.tableName).toBe("documents");
  });
});
