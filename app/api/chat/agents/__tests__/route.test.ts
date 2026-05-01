/**
 * @jest-environment node
 */

const insertMock = jest.fn()
const selectMock = jest.fn()
const fromMock = jest.fn()

jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => fromMock(...args),
  },
}))

jest.mock('@/lib/usage', () => ({
  reportUsage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/error-tracking', () => ({
  errorTracker: {
    trackError: jest.fn(() => ({
      userMessage: 'err',
      technicalMessage: 'tech',
      retryAttempts: 0,
      canRetry: false,
    })),
  },
  trackRetryError: jest.fn(() => ({
    userMessage: 'err',
    technicalMessage: 'tech',
    retryAttempts: 0,
    canRetry: false,
  })),
  createClientErrorNotification: jest.fn((info: any) => info),
}))

jest.mock('@/lib/retry', () => ({
  withRetry: async (fn: any) => {
    try {
      const data = await fn()
      return { success: true, data, attempts: 1 }
    } catch (error) {
      return { success: false, error, attempts: 1 }
    }
  },
  RETRY_CONFIGS: { LLM_API: {} },
}))

jest.mock('../../../../../lib/auth/getUserFromRequest', () => ({
  getUserFromRequest: jest.fn().mockResolvedValue({ id: 'user-123', email: 'u@x' }),
}))

const streamEventsMock = jest.fn()
const invokeMock = jest.fn()

jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: () => ({
    streamEvents: (...args: any[]) => streamEventsMock(...args),
    invoke: (...args: any[]) => invokeMock(...args),
  }),
}))

jest.mock('@/lib/llm', () => ({ llmAgent: () => ({}) }))
jest.mock('@langchain/community/tools/serpapi', () => ({ SerpAPI: class {} }))
jest.mock('../tools/NCDCoverageSearchTool', () => ({ NCDCoverageSearchTool: class {} }))
jest.mock('../tools/localLcdSearchTool', () => ({ localLcdSearchTool: {} }))
jest.mock('../tools/localArticleSearchTool', () => ({ localCoverageArticleSearchTool: {} }))
jest.mock('../tools/policyContentExtractorTool', () => ({ policyContentExtractorTool: {} }))
jest.mock('../tools/CommercialGuidelineSearchTool', () => ({
  createCommercialGuidelineSearchTool: () => ({}),
}))
jest.mock('../tools/fileUploadTool', () => ({ FileUploadTool: class {} }))
jest.mock('../agentPrompt', () => ({ AGENT_SYSTEM_CONTENT: 'sys' }))

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

type Row = Record<string, any>

function setupSupabase() {
  insertMock.mockReset().mockResolvedValue({ data: null, error: null })
  selectMock.mockReset().mockReturnValue({
    eq: () => ({
      eq: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  })
  fromMock.mockReset().mockImplementation(() => ({
    insert: (row: Row) => insertMock(row),
    select: (cols: string) => selectMock(cols),
  }))
}

function makeReq(body: any, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as any
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

async function* eventsFromContent(chunks: string[]) {
  for (const c of chunks) {
    yield { event: 'on_chat_model_stream', data: { chunk: { content: c } } }
  }
}

beforeEach(() => {
  setupSupabase()
  streamEventsMock.mockReset()
  invokeMock.mockReset()
})

describe('POST /api/chat/agents — web (streaming)', () => {
  it('streams chunks byte-equal to fixture and returns expected headers', async () => {
    const chunks = ['Hel', 'lo ', 'world']
    streamEventsMock.mockReturnValue(eventsFromContent(chunks))

    const res = await POST(
      makeReq({ messages: [{ role: 'user', content: 'hi' }] }),
    )

    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('authorization, content-type')
    expect(res.headers.get('x-thread-id')).toMatch(/[0-9a-f-]{36}/i)

    const body = await consumeStream((res as any).body)
    expect(body).toBe('Hello world')
  })

  it('persists user message before streaming begins, assistant after', async () => {
    const order: string[] = []
    fromMock.mockImplementation(() => ({
      insert: (row: Row) => {
        order.push(`insert:${row.role}`)
        return insertMock(row)
      },
      select: () => ({
        eq: () => ({
          eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }))
    streamEventsMock.mockImplementation(() => {
      order.push('streamEvents')
      return eventsFromContent(['A', 'B'])
    })

    const res = await POST(
      makeReq({
        messages: [{ role: 'user', content: 'hi' }],
        threadId: '00000000-0000-0000-0000-000000000001',
      }),
    )
    await consumeStream((res as any).body)

    expect(order[0]).toBe('insert:user')
    expect(order[1]).toBe('streamEvents')
    expect(order[order.length - 1]).toBe('insert:assistant')

    const assistantCall = insertMock.mock.calls.find((c) => c[0].role === 'assistant')!
    expect(assistantCall[0].content).toBe('AB')
    expect(assistantCall[0].status).toBe('complete')
    expect(assistantCall[0].thread_id).toBe('00000000-0000-0000-0000-000000000001')
    expect(assistantCall[0].is_thread_starter).toBe(false)
  })

  it('persists partial assistant content if stream errors mid-flight', async () => {
    streamEventsMock.mockImplementation(async function* () {
      yield { event: 'on_chat_model_stream', data: { chunk: { content: 'partial' } } }
      throw new Error('boom')
    })

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    try {
      await consumeStream((res as any).body)
    } catch {
      /* expected */
    }

    const assistantCall = insertMock.mock.calls.find((c) => c[0].role === 'assistant')
    expect(assistantCall).toBeDefined()
    expect(assistantCall![0].content).toBe('partial')
    expect(assistantCall![0].status).toBe('partial')
  })

  it('continues to stream when user-insert fails', async () => {
    insertMock.mockImplementationOnce(() => Promise.reject(new Error('db down')))
    streamEventsMock.mockReturnValue(eventsFromContent(['ok']))

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    const body = await consumeStream((res as any).body)
    expect(body).toBe('ok')
  })

  it('does not throw when assistant-insert fails', async () => {
    insertMock.mockImplementation((row: Row) =>
      row.role === 'assistant'
        ? Promise.reject(new Error('db down'))
        : Promise.resolve({ data: null, error: null }),
    )
    streamEventsMock.mockReturnValue(eventsFromContent(['ok']))

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    const body = await consumeStream((res as any).body)
    expect(body).toBe('ok')
  })

  it('marks user message as thread starter when threadId is server-generated', async () => {
    streamEventsMock.mockReturnValue(eventsFromContent(['x']))
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    await consumeStream((res as any).body)

    const userCall = insertMock.mock.calls.find((c) => c[0].role === 'user')!
    expect(userCall[0].is_thread_starter).toBe(true)
  })

  it('marks user message as non-starter when threadId already has rows', async () => {
    fromMock.mockImplementation(() => ({
      insert: (row: Row) => insertMock(row),
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ id: 'existing' }], error: null }),
          }),
        }),
      }),
    }))
    streamEventsMock.mockReturnValue(eventsFromContent(['x']))

    const res = await POST(
      makeReq({
        messages: [{ role: 'user', content: 'hi' }],
        threadId: '00000000-0000-0000-0000-000000000002',
      }),
    )
    await consumeStream((res as any).body)

    const userCall = insertMock.mock.calls.find((c) => c[0].role === 'user')!
    expect(userCall[0].is_thread_starter).toBe(false)
  })
})

describe('POST /api/chat/agents — mobile (JSON)', () => {
  it('returns existing JSON shape plus threadId field and header', async () => {
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hi' },
        { _getType: () => 'ai', content: 'hello back' },
      ],
    })

    const res: any = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-client': 'mobile' },
      ),
    )

    expect(res.headers.get('x-thread-id')).toMatch(/[0-9a-f-]{36}/i)
    const json = await res.json()
    expect(json.threadId).toMatch(/[0-9a-f-]{36}/i)
    expect(json.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello back' },
    ])
  })

  it('persists assistant message; returns JSON even if persistence fails', async () => {
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hi' },
        { _getType: () => 'ai', content: 'reply' },
      ],
    })
    insertMock.mockImplementation((row: Row) =>
      row.role === 'assistant'
        ? Promise.reject(new Error('db down'))
        : Promise.resolve({ data: null, error: null }),
    )

    const res: any = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-client': 'mobile' },
      ),
    )
    const json = await res.json()
    expect(json.messages[1].content).toBe('reply')

    const assistantCall = insertMock.mock.calls.find((c) => c[0].role === 'assistant')
    expect(assistantCall).toBeDefined()
  })
})
