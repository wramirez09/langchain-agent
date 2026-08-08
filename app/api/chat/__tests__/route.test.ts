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

// The route's job is auth context + envelopes; runChat is exercised in its own
// suite, so stub it to the two outcomes the route has to render.
const runChatMock = jest.fn()
jest.mock('@/lib/handlers/runChat', () => {
  class ChatStreamError extends Error {
    attempts: number
    cause?: Error
    constructor(message: string, attempts: number, cause?: Error) {
      super(message)
      this.name = 'ChatStreamError'
      this.attempts = attempts
      this.cause = cause
    }
  }
  return {
    ChatStreamError,
    runChat: (...a: any[]) => runChatMock(...a),
  }
})

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
import { ChatStreamError } from '@/lib/handlers/runChat'

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
  it('streams the answer and attributes the run to the signed-in user', async () => {
    runChatMock.mockResolvedValue(streamOf('hello'))

    const res: any = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))

    expect(await consumeStream(res.body)).toBe('hello')
    expect(runChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'hi' }],
        identity: expect.objectContaining({ userId: 'user-1', source: 'web' }),
      }),
    )
  })

  it('returns a 500 error payload when the stream cannot be created', async () => {
    runChatMock.mockRejectedValue(new ChatStreamError('Failed to create chat stream', 2))

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
