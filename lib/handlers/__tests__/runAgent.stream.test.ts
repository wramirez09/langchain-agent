/**
 * @jest-environment node
 */

// First coverage of the streaming branch, which previously had none — the
// shared test file stubs `streamEvents` as a bare jest.fn(). What it must
// prove: the artifact is genuinely withheld until reviewed, a failing review
// still delivers an answer, and the streamed and buffered paths agree.

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

let streamScript: any[] = []
const invokeMock = jest.fn()
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: () => ({
    invoke: (...a: any[]) => invokeMock(...a),
    streamEvents: () =>
      (async function* () {
        for (const ev of streamScript) yield ev
      })(),
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

// Delegates to the real gate unless a test makes it fail. Module exports are
// frozen, so this cannot be a spyOn.
const reviewArtifactMock = jest.fn()
jest.mock('@/lib/priorAuth/reviewArtifact', () => {
  const actual = jest.requireActual('@/lib/priorAuth/reviewArtifact')
  return {
    ...actual,
    reviewArtifact: (...a: any[]) => reviewArtifactMock(...a),
  }
})

import { runAgent } from '../runAgent'
import { ARTIFACT_JSON_EXAMPLE } from '@/lib/priorAuth/artifactSchema'
import { parseArtifactText } from '@/lib/priorAuth/extractArtifact'
import { stripControlFrames } from '@/lib/priorAuth/streamFrames'
import { goldenEvidence } from '@/lib/priorAuth/__fixtures__/artifact'

const GOLDEN = ARTIFACT_JSON_EXAMPLE
const evidence = goldenEvidence()

const toolEvents = () =>
  evidence.flatMap((m) => [
    { event: 'on_tool_start', name: m.name, data: {} },
    { event: 'on_tool_end', name: m.name, data: { output: m.content } },
  ])

const textEvents = (text: string, chunks = 8) => {
  const size = Math.ceil(text.length / chunks)
  const out: any[] = []
  for (let i = 0; i < text.length; i += size) {
    out.push({
      event: 'on_chat_model_stream',
      data: { chunk: { content: text.slice(i, i + size) } },
    })
  }
  return out
}

const webParams = () => ({
  messages: [{ role: 'user', content: 'mri knee' }],
  threadId: null,
  clientType: 'web',
  baseHeaders: {},
  identity: { userId: 'u1', source: 'web' },
  respondError: ({ status }: any) => new Response('err', { status }),
})

async function readAll(res: Response): Promise<string> {
  return await res.text()
}

/** Read the stream chunk by chunk, so we can see *when* bytes arrive. */
async function readProgressively(res: Response): Promise<string[]> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value, { stream: true }))
  }
  return chunks
}

beforeEach(() => {
  insertMock.mockClear()
  fromMock.mockClear()
  process.env.REVIEW_MODE = 'on'
  streamScript = [...toolEvents(), ...textEvents(GOLDEN)]

  const actual = jest.requireActual('@/lib/priorAuth/reviewArtifact')
  reviewArtifactMock.mockReset()
  reviewArtifactMock.mockImplementation((...a: any[]) => actual.reviewArtifact(...a))
})

afterEach(() => {
  delete process.env.REVIEW_MODE
})

describe('streaming branch — buffering', () => {
  // The core promise of the gate: nothing reviewable reaches the client
  // before it has been reviewed.
  it('emits no artifact bytes until the model has finished', async () => {
    const res = await runAgent(webParams() as any)
    const chunks = await readProgressively(res)

    // Everything before the final flush must be control frames only.
    const beforeLast = chunks.slice(0, -1).join('')
    expect(stripControlFrames(beforeLast).body).toBe('')
    expect(beforeLast).toContain('"t":"tool"')

    const artifactChunks = chunks.filter((c) => c.includes('prior-auth-summary'))
    expect(artifactChunks).toHaveLength(1)
  })

  it('delivers a parseable, reviewed artifact', async () => {
    const body = await readAll(await runAgent(webParams() as any))
    const parsed = parseArtifactText(body)
    expect(parsed?.kind).toBe('prior-auth-summary')
    expect(parsed?.review?.v).toBe(1)
  })

  it('reports tool progress while the answer is withheld', async () => {
    const body = await readAll(await runAgent(webParams() as any))
    const { frames } = stripControlFrames(body)
    expect(frames.some((f) => f.t === 'tool' && f.status === 'running')).toBe(true)
    expect(frames.some((f) => f.t === 'phase' && f.v === 'reviewing')).toBe(true)
  })
})

describe('streaming branch — persistence', () => {
  it('persists the reviewed artifact without control frames', async () => {
    // Must drain the stream: persistence happens in the reader's finally.
    await readAll(await runAgent(webParams() as any))
    const assistant = insertMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.role === 'assistant')

    expect(assistant.status).toBe('complete')
    expect(assistant.content).not.toContain('"t":"tool"')
    expect(assistant.content).not.toContain('"t":"phase"')
    expect(JSON.parse(assistant.content).review.v).toBe(1)
  })

  it('does not persist for the stateless public API', async () => {
    await readAll(
      await runAgent({
        ...webParams(),
        identity: { userId: 'u1', source: 'api' },
      } as any),
    )
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('streaming branch — fail-open', () => {
  // A gate that can fail the request it protects is worse than no gate.
  it('still delivers the answer when the review throws', async () => {
    reviewArtifactMock.mockRejectedValue(new Error('gate exploded'))

    const body = await readAll(await runAgent(webParams() as any))
    const parsed = parseArtifactText(body)
    expect(parsed?.kind).toBe('prior-auth-summary')
    // Un-reviewed, but present — that is the whole point.
    expect(parsed?.review).toBeUndefined()

    const assistant = insertMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.role === 'assistant')
    expect(assistant.status).toBe('complete')
  })

  it('passes a non-artifact answer through untouched', async () => {
    streamScript = [...textEvents('Here is a plain markdown answer.')]
    const body = await readAll(await runAgent(webParams() as any))
    expect(stripControlFrames(body).body).toBe('Here is a plain markdown answer.')
  })

  it('emits nothing but frames when the model produced no text', async () => {
    streamScript = [...toolEvents()]
    const body = await readAll(await runAgent(webParams() as any))
    expect(stripControlFrames(body).body).toBe('')
    expect(insertMock.mock.calls.map((c) => c[0].role)).not.toContain('assistant')
  })
})

describe('streaming and buffered paths agree', () => {
  // The two branches used to parse and repair differently. They now share
  // finalizeAssistantAnswer, and this is what holds that together.
  it('produces identical artifact JSON for identical input', async () => {
    const streamed = await readAll(await runAgent(webParams() as any))
    const streamedArtifact = stripControlFrames(streamed).body

    invokeMock.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: 'mri knee' },
        { _getType: () => 'ai', content: GOLDEN },
        ...evidence.map((m) => ({
          _getType: () => 'tool',
          name: m.name,
          content: m.content,
        })),
      ],
    })

    const res = await runAgent({
      ...webParams(),
      clientType: 'mobile',
      identity: { userId: 'u1', source: 'mobile' },
    } as any)
    const json = await res.json()
    const buffered = json.messages.find((m: any) => m.role === 'assistant').content

    expect(JSON.parse(streamedArtifact)).toEqual(buffered)
  })
})
