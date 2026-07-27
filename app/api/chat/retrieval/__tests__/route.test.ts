/**
 * @jest-environment node
 */

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
jest.mock('@langchain/openai', () => ({ OpenAIEmbeddings: class {} }))
jest.mock('@/lib/llm', () => ({ llmAgent: () => ({}) }))
jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: { fromTemplate: () => ({}) },
}))
jest.mock('@langchain/core/output_parsers', () => ({
  BytesOutputParser: class {},
  StringOutputParser: class {},
}))

// The vector store's retriever fires handleRetrieverEnd with the matched docs;
// the route awaits that to serialize the x-sources header.
jest.mock('@langchain/community/vectorstores/supabase', () => ({
  SupabaseVectorStore: class {
    asRetriever(opts: any) {
      const cbs = opts?.callbacks ?? []
      cbs.forEach((cb: any) =>
        cb.handleRetrieverEnd?.([
          { pageContent: 'Dana the puppy is a very good dog', metadata: { id: 1 } },
        ]),
      )
      return { pipe: () => ({}) }
    }
  },
}))

const streamMock = jest.fn()
jest.mock('@langchain/core/runnables', () => ({
  RunnableSequence: { from: () => ({ stream: (...a: any[]) => streamMock(...a) }) },
}))

jest.mock('ai', () => ({
  StreamingTextResponse: class StreamingTextResponse {
    body: ReadableStream<Uint8Array>
    headers: Headers
    constructor(body: ReadableStream<Uint8Array>, init?: { headers?: Record<string, string> }) {
      this.body = body
      this.headers = new Headers(init?.headers ?? {})
    }
  },
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as any
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  return out
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/chat/retrieval', () => {
  it('streams an answer and serializes retrieved sources into headers', async () => {
    streamMock.mockResolvedValue(streamOf('woof woof'))

    const res: any = await POST(
      makeReq({
        messages: [
          { role: 'user', content: 'previous' },
          { role: 'user', content: 'who is Dana?' },
        ],
      }),
    )

    expect(await consumeStream(res.body)).toBe('woof woof')
    // x-message-index = previousMessages.length + 1
    expect(res.headers.get('x-message-index')).toBe('2')

    const sources = JSON.parse(
      Buffer.from(res.headers.get('x-sources')!, 'base64').toString(),
    )
    expect(sources).toHaveLength(1)
    expect(sources[0].pageContent).toMatch(/Dana the puppy/)
  })

  it('returns a 500 error payload when the request has no messages', async () => {
    const res: any = await POST(makeReq({}))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })
})
