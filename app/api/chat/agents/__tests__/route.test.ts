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

jest.mock('@/lib/error-tracking', () => {
  const trackError = jest.fn(() => ({
    id: 'err_test_123',
    userMessage: 'err',
    technicalMessage: 'tech',
    retryAttempts: 0,
    canRetry: false,
  }))
  return {
    errorTracker: { trackError },
    trackRetryError: jest.fn(() => ({
      id: 'err_test_123',
      userMessage: 'err',
      technicalMessage: 'tech',
      retryAttempts: 0,
      canRetry: false,
    })),
    createClientErrorNotification: jest.fn((info: any) => info),
  }
})

const { errorTracker } = require('@/lib/error-tracking')
const trackErrorMock = errorTracker.trackError as jest.Mock

jest.mock('@/lib/retry', () => ({
  withRetry: jest.fn(),
  RETRY_CONFIGS: { LLM_API: {} },
}))

const { withRetry } = require('@/lib/retry')
const withRetryMock = withRetry as jest.Mock

jest.mock('../../../../../lib/auth/getUserFromRequest', () => ({
  getUserFromRequest: jest.fn().mockResolvedValue({ id: 'user-123', email: 'u@x' }),
}))

jest.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<any>) => {
    void p.catch(() => {})
  },
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

import { POST, OPTIONS } from '../route'

type Row = Record<string, any>

function setupSupabase() {
  insertMock.mockReset().mockResolvedValue({ data: null, error: null })
  // Supports two chains used by the route:
  //   .select('id').eq().eq().limit()                        — thread-starter probe
  //   .select('id', {count:'exact',head:true}).eq().eq().gte() — rate-limit count
  selectMock.mockReset().mockImplementation(() => ({
    eq: () => ({
      eq: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
        gte: () => Promise.resolve({ count: 0, error: null }),
      }),
    }),
  }))
  fromMock.mockReset().mockImplementation(() => ({
    insert: (row: Row) => insertMock(row),
    select: (cols: string, opts?: any) => selectMock(cols, opts),
  }))
}

function makeReq(body: any, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as any
}

function makeReqRawJson(jsonImpl: () => Promise<any>, headers: Record<string, string> = {}) {
  return {
    json: jsonImpl,
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
  withRetryMock.mockReset()
  trackErrorMock.mockClear()
})

describe('CORS', () => {
  it('echoes allowed origin on POST', async () => {
    streamEventsMock.mockReturnValue(eventsFromContent(['x']))
    const res = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { origin: 'https://app.notedoctor.ai' },
      ),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.notedoctor.ai',
    )
    expect(res.headers.get('Vary')).toBe('Origin')
    await consumeStream((res as any).body)
  })

  it('returns empty allow-origin for disallowed origin', async () => {
    streamEventsMock.mockReturnValue(eventsFromContent(['x']))
    const res = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { origin: 'https://attacker.com' },
      ),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('')
    await consumeStream((res as any).body)
  })

  it('mobile request with no Origin header succeeds end-to-end', async () => {
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hi' },
        { _getType: () => 'ai', content: 'reply' },
      ],
    })
    const res: any = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-client': 'mobile' },
      ),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('')
    const json = await res.json()
    expect(json.threadId).toMatch(/[0-9a-f-]{36}/i)
  })

  it('OPTIONS from allowed origin returns 200 with matching CORS', async () => {
    const res = await OPTIONS(
      makeReq(null, { origin: 'https://app.notedoctor.ai' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.notedoctor.ai',
    )
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe(
      'POST, OPTIONS',
    )
  })
})

describe('input validation', () => {
  it('returns 400 INVALID_JSON when body is unparseable', async () => {
    const res: any = await POST(
      makeReqRawJson(async () => {
        throw new Error('bad')
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'INVALID_JSON', requestId: null })
  })

  it('returns 400 INVALID_REQUEST_BODY for empty messages array', async () => {
    const res: any = await POST(makeReq({ messages: [] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('INVALID_REQUEST_BODY')
  })

  it('rejects more than 50 messages', async () => {
    const messages = Array.from({ length: 51 }, () => ({
      role: 'user',
      content: 'x',
    }))
    const res: any = await POST(makeReq({ messages }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('INVALID_REQUEST_BODY')
  })

  it('rejects content > 10,000 chars', async () => {
    const big = 'x'.repeat(10_001)
    const res: any = await POST(
      makeReq({ messages: [{ role: 'user', content: big }] }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('INVALID_REQUEST_BODY')
  })

  it('rejects non-uuid threadId', async () => {
    const res: any = await POST(
      makeReq({
        messages: [{ role: 'user', content: 'hi' }],
        threadId: 'not-a-uuid',
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('INVALID_REQUEST_BODY')
  })

  it('accepts undefined threadId and generates server-side UUID', async () => {
    streamEventsMock.mockReturnValue(eventsFromContent(['x']))
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(res.headers.get('x-thread-id')).toMatch(/[0-9a-f-]{36}/i)
    await consumeStream((res as any).body)
  })

  it('valid body proceeds to agent invocation', async () => {
    streamEventsMock.mockReturnValue(eventsFromContent(['ok']))
    const res = await POST(
      makeReq({
        messages: [{ role: 'user', content: 'hi' }],
        threadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
      }),
    )
    expect(streamEventsMock).toHaveBeenCalled()
    await consumeStream((res as any).body)
  })
})

describe('error response shape', () => {
  it('mobile agent failure returns AGENT_EXECUTION_FAILED with requestId only', async () => {
    invokeMock.mockRejectedValue(new Error('boom'))
    const res: any = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-client': 'mobile' },
      ),
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({
      error: 'AGENT_EXECUTION_FAILED',
      requestId: 'err_test_123',
    })
    expect(json.technicalError).toBeUndefined()
    expect(json.userMessage).toBeUndefined()
    expect(json.retryAttempts).toBeUndefined()
    expect(json.canRetry).toBeUndefined()
  })

  it('outer exception returns INTERNAL_ERROR with requestId only', async () => {
    const { getUserFromRequest } = require('../../../../../lib/auth/getUserFromRequest')
    ;(getUserFromRequest as jest.Mock).mockRejectedValueOnce(new Error('auth fail'))

    const res: any = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    const json = await res.json()
    expect(json.error).toBe('INTERNAL_ERROR')
    expect(json.requestId).toBe('err_test_123')
    expect(json.technicalError).toBeUndefined()
  })
})

describe('recursionLimit and retry', () => {
  it('invokes agent with recursionLimit 15 (mobile)', async () => {
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hi' },
        { _getType: () => 'ai', content: 'r' },
      ],
    })
    await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-client': 'mobile' },
      ),
    )
    const cfg = invokeMock.mock.calls[0][1]
    expect(cfg.recursionLimit).toBe(15)
  })

  it('does not call withRetry on the mobile branch', async () => {
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hi' },
        { _getType: () => 'ai', content: 'r' },
      ],
    })
    await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-client': 'mobile' },
      ),
    )
    expect(withRetryMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/chat/agents — web (streaming)', () => {
  it('streams chunks byte-equal to fixture and returns expected headers', async () => {
    const chunks = ['Hel', 'lo ', 'world']
    streamEventsMock.mockReturnValue(eventsFromContent(chunks))

    const res = await POST(
      makeReq(
        { messages: [{ role: 'user', content: 'hi' }] },
        { origin: 'https://app.notedoctor.ai' },
      ),
    )

    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.notedoctor.ai',
    )
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
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
            gte: () => Promise.resolve({ count: 0, error: null }),
          }),
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
        threadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
      }),
    )
    await consumeStream((res as any).body)

    expect(order[0]).toBe('insert:user')
    expect(order[1]).toBe('streamEvents')
    expect(order[order.length - 1]).toBe('insert:assistant')

    const assistantCall = insertMock.mock.calls.find((c) => c[0].role === 'assistant')!
    expect(assistantCall[0].content).toBe('AB')
    expect(assistantCall[0].status).toBe('complete')
    expect(assistantCall[0].thread_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1')
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

  it('returns 429 RATE_LIMIT_EXCEEDED when daily count is at cap', async () => {
    const prev = process.env.AGENT_RATE_LIMIT_PER_DAY
    process.env.AGENT_RATE_LIMIT_PER_DAY = '5'
    try {
      fromMock.mockImplementation(() => ({
        insert: (row: Row) => insertMock(row),
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
              gte: () => Promise.resolve({ count: 5, error: null }),
            }),
          }),
        }),
      }))
      const res: any = await POST(
        makeReq({ messages: [{ role: 'user', content: 'hi' }] }),
      )
      expect(res.status).toBe(429)
      const json = await res.json()
      expect(json.error).toBe('RATE_LIMIT_EXCEEDED')
      expect(res.headers.get('Retry-After')).toBe('3600')
      expect(insertMock).not.toHaveBeenCalled()
    } finally {
      process.env.AGENT_RATE_LIMIT_PER_DAY = prev
    }
  })

  it('marks user message as non-starter when threadId already has rows', async () => {
    fromMock.mockImplementation(() => ({
      insert: (row: Row) => insertMock(row),
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ id: 'existing' }], error: null }),
            gte: () => Promise.resolve({ count: 0, error: null }),
          }),
        }),
      }),
    }))
    streamEventsMock.mockReturnValue(eventsFromContent(['x']))

    const res = await POST(
      makeReq({
        messages: [{ role: 'user', content: 'hi' }],
        threadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2',
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
    expect(json.technicalError).toBeUndefined()
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

    await new Promise((r) => setTimeout(r, 0))
    const assistantCall = insertMock.mock.calls.find((c) => c[0].role === 'assistant')
    expect(assistantCall).toBeDefined()
  })
})
