import { localCoverageArticleSearchTool } from '../localArticleSearchTool'
import { cache } from '@/lib/cache'

describe('localCoverageArticleSearchTool', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    cache.clear()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFetch(payload: any, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Error',
      json: async () => payload,
    } as any) as any
  }

  it('returns invalid-state message', async () => {
    const out = await localCoverageArticleSearchTool._call({
      query: 'q',
      state: 'Atlantis',
      maxResults: 10,
    })
    const parsed = JSON.parse(out)
    expect(parsed.message).toMatch(/Could not find a valid state ID/)
  })

  it('returns top matches with metadata', async () => {
    mockFetch({
      data: [
        {
          document_id: '1',
          document_version: 1,
          document_display_id: 'A1',
          title: 'cardiac mri article',
          contractor_name_type: 'MACX',
          document_type: 'Article',
          url: 'https://y',
        },
      ],
    })
    const out = await localCoverageArticleSearchTool._call({
      query: 'cardiac mri article',
      maxResults: 10,
    })
    const parsed = JSON.parse(out)
    expect(parsed.topMatches[0].title).toBe('cardiac mri article')
    expect(parsed.topMatches[0].metadata.documentType).toBe('Article')
  })

  it('handles network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fail')) as any
    const out = await localCoverageArticleSearchTool._call({ query: 'q', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Error searching LCA/)
  })

  it('handles unexpected response shape', async () => {
    mockFetch({ shape: 'wrong' })
    const out = await localCoverageArticleSearchTool._call({ query: 'q', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Unexpected CMS API response/)
  })
})
