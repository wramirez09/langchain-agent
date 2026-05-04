import { localLcdSearchTool } from '../localLcdSearchTool'
import { cache } from '@/lib/cache'

describe('localLcdSearchTool', () => {
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

  it('returns state-required message and skips fetch when state is missing', async () => {
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy as any
    const out = await localLcdSearchTool._call({ query: 'q', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.message).toMatch(/requires a U\.S\. state/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns state-required message when state is empty string', async () => {
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy as any
    const out = await localLcdSearchTool._call({
      query: 'q',
      state: '',
      maxResults: 10,
    })
    const parsed = JSON.parse(out)
    expect(parsed.message).toMatch(/requires a U\.S\. state/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns no-match for unknown state', async () => {
    const out = await localLcdSearchTool._call({
      query: 'q',
      state: 'Atlantis',
      maxResults: 10,
    })
    const parsed = JSON.parse(out)
    expect(parsed.message).toMatch(/Could not find a valid state ID/)
  })

  it('scores LCDs and returns top match', async () => {
    mockFetch({
      data: [
        {
          document_id: '1',
          document_version: 1,
          document_display_id: 'L1',
          title: 'lumbar spine MRI',
          contractor_name_type: 'MAC1',
          state_description: 'Illinois',
          url: 'https://x',
        },
      ],
    })
    const out = await localLcdSearchTool._call({
      query: 'lumbar spine MRI',
      state: 'Illinois',
      maxResults: 10,
    })
    const parsed = JSON.parse(out)
    expect(parsed.topMatches[0].title).toBe('lumbar spine MRI')
    expect(parsed.topMatches[0].metadata.contractor).toBe('MAC1')
  })

  it('handles unexpected response shape', async () => {
    mockFetch({ shape: 'wrong' })
    const out = await localLcdSearchTool._call({ query: 'q', state: 'Illinois', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Unexpected CMS API response/)
  })

  it('returns no-match message when scored is empty', async () => {
    mockFetch({ data: [{ document_id: '1', document_version: 1, document_display_id: 'L1', title: 'unrelated' }] })
    const out = await localLcdSearchTool._call({ query: 'asdfqwerzxcv', state: 'Illinois', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.message).toMatch(/No LCD found/)
  })

  it('handles network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as any
    const out = await localLcdSearchTool._call({ query: 'q', state: 'Illinois', maxResults: 10 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Error searching LCD/)
  })
})
