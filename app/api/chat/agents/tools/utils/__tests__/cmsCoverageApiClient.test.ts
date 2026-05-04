jest.mock('@/lib/cache', () => {
  const store = new Map<string, any>()
  return {
    cache: {
      get: (k: string) => (store.has(k) ? store.get(k) : null),
      set: (k: string, v: any) => { store.set(k, v) },
      clear: () => store.clear(),
    },
    TTL: { LONG: 1000 },
  }
})

import { cmsCoverageApiClient } from '../cmsCoverageApiClient'
import { cache } from '@/lib/cache'

const realFetch = global.fetch

function jsonResponse(body: any, init: Partial<Response> = {}): any {
  return {
    ok: init.status ? init.status < 400 : true,
    status: init.status ?? 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
    ...init,
  }
}

describe('cmsCoverageApiClient', () => {
  beforeEach(() => {
    cmsCoverageApiClient._resetForTest()
    ;(cache as any).clear?.()
  })
  afterAll(() => {
    global.fetch = realFetch
  })

  it('NCD fetch uses ncdid/ncdver params and sends no Authorization', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      jsonResponse({
        meta: { status: { id: 200, message: 'OK' } },
        data: [
          {
            title: 'Test NCD',
            indications_limitations:
              '<p>Covered indication paragraph that is long enough to retain.</p>',
            item_service_description: 'Some service description here, fully spelled out.',
            reasons_for_denial: '',
          },
        ],
      }),
    )
    global.fetch = fetchMock as any

    const out = await cmsCoverageApiClient.fetchNcd('177', 6)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callUrl = fetchMock.mock.calls[0][0]
    expect(callUrl).toContain('/data/ncd?ncdid=177&ncdver=6')
    const callInit = fetchMock.mock.calls[0][1]
    expect(callInit.headers.Authorization).toBeUndefined()
    expect(out.summary).toContain('Test NCD')
    expect(out.medicalNecessityCriteria.length).toBeGreaterThan(0)
  })

  it('LCD fetch obtains and reuses license token, uses lcdid/ver params', async () => {
    const lcdData = (title: string) => ({
      meta: { status: { id: 200, message: 'OK' } },
      data: [
        {
          title,
          indication: '<p>Coverage indication paragraph long enough to retain.</p>',
          diagnoses_support: 'E11.65 supports medical necessity',
          coding_guidelines: 'CPT 95250',
          doc_reqs: '',
        },
      ],
    })
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ Token: 'tok-A' }] }),
      )
      .mockResolvedValueOnce(jsonResponse(lcdData('LCD-1')))
      .mockResolvedValueOnce(jsonResponse(lcdData('LCD-2')))
    global.fetch = fetchMock as any

    await cmsCoverageApiClient.fetchLcd('L1', 1)
    await cmsCoverageApiClient.fetchLcd('L2', 1)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toContain('/metadata/license-agreement')
    expect(fetchMock.mock.calls[1][0]).toContain('/data/lcd?lcdid=L1&ver=1')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok-A')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer tok-A')
  })

  it('refreshes token on 401 then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ Token: 'expired' }] }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ Token: 'fresh' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          meta: { status: { id: 200, message: 'OK' } },
          data: [
            {
              title: 'Article-1',
              description:
                '<p>Article body paragraph that is long enough to retain after parsing.</p>',
            },
          ],
        }),
      )
    global.fetch = fetchMock as any

    const details = await cmsCoverageApiClient.fetchArticle('A1', 5)
    expect(details.summary).toContain('Article-1')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[1][0]).toContain('/data/article?articleid=A1&ver=5')
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer fresh')
  })

  it('warm-cache hit returns without HTTP', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        meta: { status: { id: 200, message: 'OK' } },
        data: [
          {
            title: 'cached-source',
            indications_limitations:
              '<p>Some indication text long enough to make it through the splitter.</p>',
          },
        ],
      }),
    )
    global.fetch = fetchMock as any

    await cmsCoverageApiClient.fetchNcd('555', 2)
    fetchMock.mockClear()
    const start = Date.now()
    const second = await cmsCoverageApiClient.fetchNcd('555', 2)
    expect(Date.now() - start).toBeLessThan(100)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(second.summary).toContain('cached-source')
  })

  it('LCD mapper: separates supports vs not-supports ICD-10 by context', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ Token: 't' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          meta: { status: { id: 200, message: 'OK' } },
          data: [
            {
              title: 'M',
              indication:
                '<p>Indication paragraph long enough to retain through filtering.</p>',
              diagnoses_support: 'E11.65 covered',
              diagnoses_dont_support: 'Z99.89 not covered',
              coding_guidelines: 'See CPT 95250 for billing.',
            },
          ],
        }),
      )
    global.fetch = fetchMock as any

    const details = await cmsCoverageApiClient.fetchLcd('L', 1)
    const contexts = details.icd10Codes.map((c) => `${c.code}:${c.context}`)
    expect(contexts).toContain('E11.65:supports medical necessity')
    expect(contexts).toContain('Z99.89:does not support medical necessity')
    expect(details.cptCodes.find((c) => c.code === '95250')).toBeDefined()
  })

  it('throws on CMS error envelope (status.id >= 400)', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      jsonResponse({
        meta: { status: { id: 400, message: 'invalid ncdid' } },
        data: [],
      }),
    )
    global.fetch = fetchMock as any
    await expect(cmsCoverageApiClient.fetchNcd('bogus', 0)).rejects.toThrow(
      /400.*invalid ncdid/,
    )
  })
})
