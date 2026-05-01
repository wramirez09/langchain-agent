jest.mock('cheerio', () => ({
  load: (html: string) => {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const fakeElem = {
      remove: () => fakeElem,
      text: () => text,
    }
    return (sel?: string) => fakeElem
  },
}))

jest.mock('@/lib/llm', () => ({
  llmSummarizer: () => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        priorAuthRequired: 'YES',
        medicalNecessityCriteria: ['criterion 1'],
        icd10Codes: [],
        cptCodes: [],
        requiredDocumentation: [],
        limitationsExclusions: [],
        summary: 'A summary',
      }),
    }),
  }),
}))

import {
  policyContentExtractorTool,
  getStructuredPolicyDetails,
} from '../policyContentExtractorTool'
import { cache } from '@/lib/cache'

describe('policyContentExtractorTool', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    cache.clear()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('extracts and summarizes HTML content', async () => {
    const longBody = 'medical necessity criterion '.repeat(50)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => `<html><body><p>${longBody}</p></body></html>`,
    } as any) as any

    const out = await policyContentExtractorTool._call({
      policyUrls: ['https://example.com/policy'],
    } as any)
    const parsed = JSON.parse(out)
    expect(parsed.priorAuthRequired).toBe('YES')
    expect(parsed.summary).toBe('A summary')
  })

  it('returns short-content error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>tiny</body></html>',
    } as any) as any

    const out = await policyContentExtractorTool._call({
      policyUrls: ['https://example.com/policy'],
    } as any)
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/Content too short/)
  })

  it('returns error on failed fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: { get: () => 'text/html' },
    } as any) as any
    const out = await policyContentExtractorTool._call({
      policyUrls: ['https://example.com/policy'],
    } as any)
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/HTTP 500/)
  })

  it('returns array when multiple URLs', async () => {
    const longBody = 'medical necessity criterion '.repeat(50)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => `<html><body><p>${longBody}</p></body></html>`,
    } as any) as any

    const out = await policyContentExtractorTool._call({
      policyUrls: ['https://a.com/p', 'https://b.com/p'],
    } as any)
    const parsed = JSON.parse(out)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })
})

describe('getStructuredPolicyDetails', () => {
  it('returns parsed schema on valid LLM output', async () => {
    const result = await getStructuredPolicyDetails('some policy text')
    expect(result?.priorAuthRequired).toBe('YES')
    expect(result?.medicalNecessityCriteria).toEqual(['criterion 1'])
  })
})
