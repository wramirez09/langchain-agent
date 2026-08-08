import { CommercialGuidelineSearchTool } from '../CommercialGuidelineSearchTool'
import { cache } from '@/lib/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Embedding is irrelevant to assertions — return a fixed zero vector so the
// tool's embed step is deterministic and offline.
jest.mock('@/lib/embeddings', () => ({
  EMBEDDING_DIMS: 1536,
  EMBEDDING_MODEL: 'text-embedding-3-small',
  embedQuery: jest.fn(async () => new Float32Array(1536)),
}))

// Stub the Supabase client so the only thing under test is how the tool maps
// RPC rows → tool output.
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: jest.fn() },
}))

// labelCode normally scans the local corpus (fs). Mock it to a visible
// transform so we can assert the enrichment is actually wired in.
jest.mock('../utils/codeLabels', () => ({
  labelCode: (code: string) => `${code} — LABEL`,
}))

const mockedRpc = supabaseAdmin.rpc as jest.MockedFunction<
  typeof supabaseAdmin.rpc
>

const baseRow = (overrides: Record<string, any> = {}) => ({
  id: 'doc-1',
  title: 'MRI Lumbar Spine',
  domain: 'spine',
  treatment: 'MRI Lumbar',
  cpt_codes: ['72148'],
  icd10_codes: ['M54.5'],
  excerpt: 'Lumbar MRI overview.',
  body: 'Lumbar MRI overview.\n\nConservative therapy for at least 6 weeks is required.',
  score: 0.9,
  signals: { lex: 0.4, sem: 0.5, cpt: 0 },
  ...overrides,
})

describe('CommercialGuidelineSearchTool', () => {
  let tool: CommercialGuidelineSearchTool

  beforeEach(() => {
    cache.clear()
    mockedRpc.mockReset()
    tool = new CommercialGuidelineSearchTool()
  })

  it('maps RPC rows into structured matches with labeled codes', async () => {
    mockedRpc.mockResolvedValue({ data: [baseRow()], error: null } as any)

    const out = JSON.parse(
      await tool.invoke({ query: 'lumbar mri' } as any),
    )

    expect(out.query).toBe('lumbar mri')
    expect(out.topMatches).toHaveLength(1)
    const m = out.topMatches[0]
    expect(m.id).toBe('doc-1')
    expect(m.title).toBe('MRI Lumbar Spine')
    // Codes are enriched via labelCode.
    expect(m.cptCodes).toEqual(['72148 — LABEL'])
    expect(m.icd10Codes).toEqual(['M54.5 — LABEL'])
    // Signals with value > 0 become matchedOn entries.
    expect(m.matchedOn).toEqual(expect.arrayContaining(['lex:0.40', 'sem:0.50']))
    expect(m.matchedOn).not.toContain('cpt:0.00')
  })

  it('never emits the internal path or a raw body field', async () => {
    mockedRpc.mockResolvedValue({
      data: [baseRow({ body: 'Body text.' })],
      error: null,
    } as any)

    const match = JSON.parse(await tool.invoke({ query: 'lumbar mri' } as any))
      .topMatches[0]

    // Guideline text reaches the agent only through `excerpt`; `body` and the
    // filesystem `path` are stripped at the serialization boundary.
    expect(match).not.toHaveProperty('path')
    expect(match).not.toHaveProperty('body')
  })

  // The excerpt is cut from the full body around the query's terms. Sending
  // only the document's opening (the RPC's own `excerpt` column) was how
  // criteria buried mid-document — the thresholds — stopped reaching the model.
  it('excerpts the body around the query rather than its opening', async () => {
    const filler = 'unrelated coding and billing narrative. '.repeat(400)
    mockedRpc.mockResolvedValue({
      data: [
        baseRow({
          excerpt: 'Lumbar MRI overview.',
          body: [
            'Lumbar MRI overview.',
            filler,
            'CRITERIA. Conservative therapy for at least 6 weeks within the last 6 months.',
          ].join('\n\n'),
        }),
      ],
      error: null,
    } as any)

    const match = JSON.parse(
      await tool.invoke({
        query: 'lumbar mri conservative therapy',
        treatment: 'MRI lumbar spine',
      } as any),
    ).topMatches[0]

    expect(match.excerpt).toContain('at least 6 weeks within the last 6 months')
    expect(match.excerpt).toContain('Lumbar MRI overview.')
  })

  it('splits results into top and related matches by maxResults', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      baseRow({ id: `doc-${i}`, score: 1 - i * 0.1 }),
    )
    mockedRpc.mockResolvedValue({ data: rows, error: null } as any)

    const out = JSON.parse(
      await tool.invoke({ query: 'lumbar mri', maxResults: 2 } as any),
    )

    expect(out.topMatches).toHaveLength(2)
    expect(out.relatedMatches).toHaveLength(3)
  })

  it('returns an error payload (not a throw) when the RPC errors', async () => {
    mockedRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc exploded' },
    } as any)

    const out = JSON.parse(await tool.invoke({ query: 'x' } as any))

    expect(out.topMatches).toEqual([])
    expect(out.relatedMatches).toEqual([])
    expect(out.error).toBe('rpc exploded')
  })

  it('serves identical queries from cache without a second RPC call', async () => {
    mockedRpc.mockResolvedValue({ data: [baseRow()], error: null } as any)

    const first = await tool.invoke({ query: 'lumbar mri' } as any)
    const second = await tool.invoke({ query: 'lumbar mri' } as any)

    expect(second).toBe(first)
    expect(mockedRpc).toHaveBeenCalledTimes(1)
  })
})
