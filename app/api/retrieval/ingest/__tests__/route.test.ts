/**
 * @jest-environment node
 */

const loadMock = jest.fn()
const splitMock = jest.fn((...a: any[]) => a[0])
const fromDocumentsMock = jest.fn().mockResolvedValue(undefined)
const invokeMock = jest.fn()

jest.mock('@langchain/community/document_loaders/fs/pdf', () => ({
  PDFLoader: class {
    load = (...a: any[]) => loadMock(...a)
  },
}))
jest.mock('langchain/text_splitter', () => ({
  RecursiveCharacterTextSplitter: class {
    splitDocuments = (...a: any[]) => splitMock(...a)
  },
}))
jest.mock('@langchain/community/vectorstores/supabase', () => ({
  SupabaseVectorStore: { fromDocuments: (...a: any[]) => fromDocumentsMock(...a) },
}))
jest.mock('@langchain/openai', () => ({ OpenAIEmbeddings: class {} }))
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/llm', () => ({ llmAgent: () => ({ invoke: (...a: any[]) => invokeMock(...a) }) }))
jest.mock('@langchain/core/messages', () => ({ HumanMessage: class {} }))

// The route reads these at module scope and throws if any are missing.
let POST: (req: any) => Promise<any>
beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_PRIVATE_KEY = 'service-key'
  process.env.OPENAI_API_KEY = 'openai-key'
  ;({ POST } = await import('../route'))
})

function reqWithFile(file: unknown) {
  return { formData: async () => ({ get: (k: string) => (k === 'file' ? file : null) }) } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  splitMock.mockImplementation(async (docs: any[]) => docs)
  fromDocumentsMock.mockResolvedValue(undefined)
})

describe('POST /api/retrieval/ingest', () => {
  it('returns 400 when no file is provided', async () => {
    const res: any = await POST(reqWithFile(null))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file uploaded')
  })

  it('returns 400 for a non-PDF file', async () => {
    const file = new Blob(['hello'], { type: 'text/plain' })
    const res: any = await POST(reqWithFile(file))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Only PDF files are supported')
  })

  it('returns 400 when the file exceeds the size limit', async () => {
    const big = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'application/pdf' })
    const res: any = await POST(reqWithFile(big))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/10MB/)
  })

  it('ingests a PDF and returns the generated query and a document id', async () => {
    loadMock.mockResolvedValue([{ pageContent: 'patient has type 1 diabetes', metadata: {} }])
    invokeMock.mockResolvedValue({ content: 'Insulin pump therapy for Type 1 diabetes' })

    const file = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' })
    const res: any = await POST(reqWithFile(file))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.generatedQuery).toBe('Insulin pump therapy for Type 1 diabetes')
    expect(json.documentId).toMatch(/^doc_/)
    expect(fromDocumentsMock).toHaveBeenCalled()
  })

  it('returns 500 when the PDF has no extractable content', async () => {
    loadMock.mockResolvedValue([])
    const file = new Blob(['%PDF-1.4 empty'], { type: 'application/pdf' })
    const res: any = await POST(reqWithFile(file))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
  })
})
