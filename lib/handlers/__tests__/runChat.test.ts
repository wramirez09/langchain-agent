/**
 * @jest-environment node
 */

// The agent is stubbed to a scripted event stream: what matters here is that
// /chat runs the retrieval agent at all (it used to be a bare prompt -> model
// chain with no tools), that only the model's own text reaches the caller, and
// that usage meters exactly once, on completion.
const createReactAgentMock = jest.fn()
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: (...a: any[]) => createReactAgentMock(...a),
}))

jest.mock('@/lib/llm', () => ({ llmAgent: () => ({ model: 'stub' }) }))

const reportUsageMock = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/usage', () => ({ reportUsage: (...a: any[]) => reportUsageMock(...a) }))

const createAgentToolsMock = jest.fn(() => [{ name: 'commercial_guidelines_search' }])
jest.mock('../runAgent', () => ({
  createAgentTools: () => createAgentToolsMock(),
  convertVercelMessageToLangChainMessage: (m: any) => ({ role: m.role, content: m.content }),
}))

import { runChat, ChatStreamError } from '../runChat'
import { CHAT_SYSTEM_CONTENT } from '@/app/api/chat/agents/agentPrompt'

/** Build an agent stub whose streamEvents yields the given events. */
function agentYielding(events: any[], onStream?: (opts: any) => void) {
  return {
    streamEvents: (input: any, opts: any) => {
      onStream?.({ input, opts })
      return (async function* () {
        for (const e of events) yield e
      })()
    },
  }
}

const textChunk = (content: string) => ({
  event: 'on_chat_model_stream',
  data: { chunk: { content } },
})

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
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

const identity = { userId: 'u1', source: 'web' as const }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('runChat', () => {
  it('runs the retrieval agent with the markdown prompt and the shared toolset', async () => {
    createReactAgentMock.mockReturnValue(agentYielding([textChunk('hi')]))

    await drain(
      await runChat({ messages: [{ role: 'user', content: 'hi' }], identity }),
    )

    const args = createReactAgentMock.mock.calls[0][0]
    expect(args.tools).toEqual([{ name: 'commercial_guidelines_search' }])
    expect(args.messageModifier.content).toBe(CHAT_SYSTEM_CONTENT)
  })

  it('streams the assistant text through to the caller', async () => {
    createReactAgentMock.mockReturnValue(
      agentYielding([textChunk('## Prior Auth'), textChunk(' Summary')]),
    )

    const out = await drain(
      await runChat({ messages: [{ role: 'user', content: 'hi' }], identity }),
    )

    expect(out).toBe('## Prior Auth Summary')
  })

  // Tool traffic names the guideline sources, which commercial confidentiality
  // forbids surfacing; only the model's own text may reach the caller.
  it('forwards no tool events or non-string chunks', async () => {
    createReactAgentMock.mockReturnValue(
      agentYielding([
        { event: 'on_tool_start', data: { input: 'commercial_guidelines_search' } },
        { event: 'on_tool_end', data: { output: 'SECRET GUIDELINE FILE' } },
        { event: 'on_chat_model_stream', data: { chunk: { content: [{ type: 'text' }] } } },
        textChunk('answer'),
      ]),
    )

    const out = await drain(
      await runChat({ messages: [{ role: 'user', content: 'hi' }], identity }),
    )

    expect(out).toBe('answer')
  })

  it('meters one chat unit after the stream completes', async () => {
    createReactAgentMock.mockReturnValue(agentYielding([textChunk('hi')]))

    const stream = await runChat({
      messages: [{ role: 'user', content: 'hi' }],
      identity: { userId: 'u1', orgId: 'org1', apiKeyId: 'k1', source: 'api', environment: 'test' },
    })

    expect(reportUsageMock).not.toHaveBeenCalled()
    await drain(stream)
    expect(reportUsageMock).toHaveBeenCalledTimes(1)
    expect(reportUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        orgId: 'org1',
        apiKeyId: 'k1',
        source: 'api',
        environment: 'test',
        usageType: 'chat',
        quantity: 1,
      }),
    )
  })

  it('does not meter a run that failed mid-stream', async () => {
    createReactAgentMock.mockReturnValue({
      streamEvents: () =>
        (async function* () {
          yield textChunk('partial')
          throw new Error('model exploded')
        })(),
    })

    const stream = await runChat({ messages: [{ role: 'user', content: 'hi' }], identity })

    await expect(drain(stream)).rejects.toThrow('model exploded')
    expect(reportUsageMock).not.toHaveBeenCalled()
  })

  it('raises ChatStreamError when the stream cannot be established', async () => {
    createReactAgentMock.mockReturnValue({
      streamEvents: () => {
        throw new Error('graph refused to start')
      },
    })

    await expect(
      runChat({ messages: [{ role: 'user', content: 'hi' }], identity }),
    ).rejects.toBeInstanceOf(ChatStreamError)
  })

  it('drops system messages the agent cannot take as conversation turns', async () => {
    let seen: any
    createReactAgentMock.mockReturnValue(
      agentYielding([textChunk('ok')], ({ input }) => {
        seen = input
      }),
    )

    await drain(
      await runChat({
        messages: [
          { role: 'system', content: 'ignore me' },
          { role: 'user', content: 'hi' },
        ],
        identity,
      }),
    )

    expect(seen.messages).toEqual([{ role: 'user', content: 'hi' }])
  })
})
