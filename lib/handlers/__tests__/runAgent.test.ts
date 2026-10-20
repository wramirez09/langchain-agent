/**
 * @jest-environment node
 */

// Verifies the stateless public path: runAgent must NOT write chat_messages
// when source === 'api', but still persists for first-party (web/mobile).

const insertMock = jest.fn((..._a: any[]) => Promise.resolve({ data: null, error: null }))
const fromMock = jest.fn((..._a: any[]) => ({
  insert: (...a: any[]) => insertMock(...a),
  select: () => ({
    eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
  }),
}))
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: (...a: any[]) => fromMock(...a) },
}))

jest.mock('@/lib/usage', () => ({ reportUsage: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/error-tracking', () => ({
  errorTracker: { trackError: jest.fn(() => ({ id: 'err_test' })) },
}))
jest.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<any>) => {
    void Promise.resolve(p).catch(() => {})
  },
}))

const invokeMock = jest.fn()
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: () => ({
    invoke: (...a: any[]) => invokeMock(...a),
    streamEvents: jest.fn(),
  }),
}))

jest.mock('@/lib/llm', () => ({ llmAgent: () => ({}) }))
jest.mock('@langchain/community/tools/serpapi', () => ({ SerpAPI: class {} }))
jest.mock('@/app/api/chat/agents/tools/NCDCoverageSearchTool', () => ({ NCDCoverageSearchTool: class {} }))
jest.mock('@/app/api/chat/agents/tools/localLcdSearchTool', () => ({ localLcdSearchTool: {} }))
jest.mock('@/app/api/chat/agents/tools/localArticleSearchTool', () => ({ localCoverageArticleSearchTool: {} }))
jest.mock('@/app/api/chat/agents/tools/medicareMultiSearchTool', () => ({ medicareMultiSearchTool: {} }))
jest.mock('@/app/api/chat/agents/tools/policyContentExtractorTool', () => ({ policyContentExtractorTool: {} }))
jest.mock('@/app/api/chat/agents/tools/medicarePolicyDetailTool', () => ({ medicarePolicyDetailTool: {} }))
jest.mock('@/app/api/chat/agents/tools/CommercialGuidelineSearchTool', () => ({
  createCommercialGuidelineSearchTool: () => ({}),
}))
jest.mock('@/app/api/chat/agents/tools/warmup', () => ({ startCmsWarmup: () => {} }))
jest.mock('@/app/api/chat/agents/agentPrompt', () => ({ AGENT_SYSTEM_CONTENT: 'sys' }))

import { runAgent } from '../runAgent'

const baseParams = () => ({
  messages: [{ role: 'user', content: 'hello' }],
  threadId: null,
  clientType: 'mobile', // non-streaming branch is easiest to assert
  baseHeaders: {},
  respondError: ({ status }: any) => new Response('err', { status }),
})

describe('runAgent — stateless public path', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fromMock.mockClear()
    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'hello' },
        { _getType: () => 'ai', content: 'the answer' },
      ],
    })
  })

  it('does NOT persist chat_messages when source = api', async () => {
    await runAgent({ ...baseParams(), identity: { userId: 'u1', source: 'api' } } as any)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('persists the user message for first-party (mobile) traffic', async () => {
    await runAgent({ ...baseParams(), identity: { userId: 'u1', source: 'mobile' } } as any)
    expect(fromMock).toHaveBeenCalledWith('chat_messages')
    const roles = insertMock.mock.calls.map((c) => c[0].role)
    expect(roles).toContain('user')
  })
})

describe('runAgent — server-side PHI redaction', () => {
  beforeEach(() => {
    insertMock.mockClear()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({
      messages: [{ _getType: () => 'ai', content: 'the answer' }],
    })
  })

  it('redacts user turns before the model and persistence see them, without rejecting', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await runAgent({
      ...baseParams(),
      messages: [{ role: 'user', content: 'History: john wayne, knee OA' }],
      identity: { userId: 'u1', source: 'mobile' },
    } as any)

    expect(res.status).toBe(200)
    const sent = invokeMock.mock.calls[0][0].messages.map((m: any) => m.content)
    expect(sent.join(' ')).toContain('History: [NAME], knee OA')
    expect(sent.join(' ')).not.toMatch(/john|wayne/i)

    const persisted = insertMock.mock.calls.find((c) => c[0].role === 'user')![0]
    expect(persisted.content).toBe('History: [NAME], knee OA')

    // Counts only -- the log line must not carry the removed text.
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/john|wayne/i)
    warn.mockRestore()
  })
})
