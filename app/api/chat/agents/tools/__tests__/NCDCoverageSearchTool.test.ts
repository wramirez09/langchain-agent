import { NCDCoverageSearchTool } from '../NCDCoverageSearchTool'
import { cache } from '@/lib/cache'

describe('NCDCoverageSearchTool', () => {
  let tool: NCDCoverageSearchTool
  let originalFetch: typeof fetch

  beforeEach(() => {
    cache.clear()
    tool = new NCDCoverageSearchTool()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFetch(payload: any, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => payload,
    } as any) as any
  }

  it('returns top matches sorted by score', async () => {
    mockFetch({
      meta: { status: { id: 200, message: 'ok' } },
      data: [
        {
          document_id: '1',
          document_version: 1,
          document_display_id: 'NCD2203',
          title: 'cardiac mri',
          document_status: 'A',
          last_updated: '2024-01-01',
        },
        {
          document_id: '2',
          document_version: 1,
          document_display_id: 'OTHER',
          title: 'unrelated topic',
        },
      ],
    })

    const out = await tool._call({ query: 'cardiac mri', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.topMatches).toHaveLength(1)
    expect(parsed.topMatches[0].title).toBe('cardiac mri')
    expect(parsed.topMatches[0].url).toMatch(/ncdid=1/)
  })

  it('returns no-match message when nothing scores', async () => {
    mockFetch({
      meta: { status: { id: 200, message: 'ok' } },
      data: [{ document_id: '1', document_version: 1, document_display_id: 'NCD9999', title: 'unrelated topic' }],
    })
    const out = await tool._call({ query: 'qqqq', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.topMatches).toEqual([])
    expect(parsed.message).toMatch(/No NCD found/)
  })

  it('handles unexpected response shape', async () => {
    mockFetch({ unexpected: true })
    const out = await tool._call({ query: 'q', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Unexpected CMS API response/)
  })

  it('returns CMS API error when meta.status >= 400', async () => {
    mockFetch({ meta: { status: { id: 500, message: 'boom' } }, data: [] })
    const out = await tool._call({ query: 'q', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/CMS Coverage API error/)
  })

  it('handles fetch failure gracefully', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any
    const out = await tool._call({ query: 'q', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Error searching NCD/)
  })

  it('uses cached result on second call', async () => {
    mockFetch({
      meta: { status: { id: 200, message: 'ok' } },
      data: [{ document_id: '1', document_version: 1, document_display_id: 'NCD1', title: 'q' }],
    })
    await tool._call({ query: 'q', maxResults: 10 })
    await tool._call({ query: 'q', maxResults: 10 })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1)
  })
})
