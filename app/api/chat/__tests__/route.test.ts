/**
 * @jest-environment node
 */

// Auth lookup for error-tracking context.
const getUserMock = jest.fn()
jest.mock('@/utils/server', () => ({
  createClient: async () => ({
    auth: { getUser: (...a: any[]) => getUserMock(...a) },
  }),
}))

// The chain is constructed but never executed directly — withRetry is mocked to
// control the outcome, so the prompt/model/parser only need to be chainable.
jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: () => ({ pipe: () => ({ pipe: () => ({ stream: jest.fn() }) }) }),
  },
}))
jest.mock('langchain/output_parsers', () => ({
  HttpResponseOutputParser: class {},
}))
jest.mock('@/lib/llm', () => ({ llmAgent: () => ({}) }))

const reportUsageMock = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/usage', () => ({ reportUsage: (...a: any[]) => reportUsageMock(...a) }))

const withRetryMock = jest.fn()
jest.mock('@/lib/retry', () => ({
  withRetry: (...a: any[]) => withRetryMock(...a),
  RETRY_CONFIGS: { LLM_API: {} },
}))

jest.mock('@/lib/error-tracking', () => ({
  errorTracker: {
    trackError: jest.fn(() => ({
      userMessage: 'Something went wrong',
      technicalMessage: 'tech',
      retryAttempts: 0,
      canRetry: false,
    })),
  },
  trackRetryError: jest.fn(() => ({
    userMessage: 'Could not complete chat',
    technicalMessage: 'tech',
    retryAttempts: 2,
    canRetry: true,
  })),
  createClientErrorNotification: jest.fn((info: any) => info),
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

beforeEach(() => {
  jest.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST /api/chat', () => {
  it('streams the chat completion and reports usage on completion', async () => {
    withRetryMock.mockResolvedValue({ success: true, data: streamOf('hello') })

    const res: any = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))

    expect(res.body).toBeDefined()
    const text = await consumeStream(res.body)
    expect(text).toBe('hello')
    // usage is reported from the transform's flush after the stream drains
    expect(reportUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', usageType: 'chat' }),
    )
  })

  it('returns a 500 error payload when the stream cannot be created', async () => {
    withRetryMock.mockResolvedValue({
      success: false,
      error: new Error('LLM down'),
      attempts: 2,
    })

    const res: any = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Could not complete chat')
    expect(json.canRetry).toBe(true)
  })

  it('returns a 500 error payload when the request body is malformed', async () => {
    const res: any = await POST({ json: async () => { throw new Error('bad json') } } as any)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Something went wrong')
  })
})
