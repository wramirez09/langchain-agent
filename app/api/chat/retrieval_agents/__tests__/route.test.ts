/**
 * @jest-environment node
 */

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
jest.mock('@langchain/openai', () => ({ OpenAIEmbeddings: class {} }))
jest.mock('@/lib/llm', () => ({ llmAgent: () => ({}) }))
jest.mock('@langchain/community/vectorstores/supabase', () => ({
  SupabaseVectorStore: class {
    asRetriever() {
      return {}
    }
  },
}))
jest.mock('langchain/tools/retriever', () => ({
  createRetrieverTool: () => ({}),
}))

const streamEventsMock = jest.fn()
const invokeMock = jest.fn()
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: () => ({
    streamEvents: (...a: any[]) => streamEventsMock(...a),
    invoke: (...a: any[]) => invokeMock(...a),
  }),
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

describe('POST /api/chat/retrieval_agents', () => {
  it('streams only the final model content when not returning intermediate steps', async () => {
    async function* events() {
      // intermediate tool-calling chunk (no content) is skipped
      yield { event: 'on_chat_model_stream', data: { chunk: { content: '' } } }
      yield { event: 'on_chat_model_stream', data: { chunk: { content: 'BEEP ' } } }
      yield { event: 'on_chat_model_stream', data: { chunk: { content: 'BOOP' } } }
    }
    streamEventsMock.mockReturnValue(events())

    const res: any = await POST(
      makeReq({ messages: [{ role: 'user', content: 'what is LangChain?' }] }),
    )

    expect(await consumeStream(res.body)).toBe('BEEP BOOP')
  })

  it('returns mapped messages as JSON when show_intermediate_steps is set', async () => {
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hi' },
        { _getType: () => 'ai', content: 'BEEP BOOP hello', tool_calls: [] },
      ],
    })

    const res: any = await POST(
      makeReq({
        messages: [{ role: 'user', content: 'hi' }],
        show_intermediate_steps: true,
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'BEEP BOOP hello', tool_calls: [] },
    ])
  })

  it('returns a 500 error payload when the request body is malformed', async () => {
    const res: any = await POST({ json: async () => { throw new Error('bad') } } as any)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('bad')
  })
})
