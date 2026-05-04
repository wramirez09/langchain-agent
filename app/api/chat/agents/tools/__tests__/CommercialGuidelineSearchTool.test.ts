jest.mock('../utils/commercialGuidelineLoaderOptimized', () => ({
  getMetadataIndex: () => [],
  loadRelevantDocuments: jest.fn(),
}))

import {
  CommercialGuidelineSearchTool,
  createCommercialGuidelineSearchTool,
} from '../CommercialGuidelineSearchTool'
import { loadRelevantDocuments } from '../utils/commercialGuidelineLoaderOptimized'

const mockedLoad = loadRelevantDocuments as jest.MockedFunction<
  typeof loadRelevantDocuments
>

const baseDoc = (overrides: any = {}) => ({
  id: 'a',
  title: 'MRI Lumbar',
  treatment: 'MRI Lumbar',
  domain: 'spine',
  sourceGroup: 'plaintextspine',
  sourceType: 'commercial-guideline' as const,
  path: '/p/a.md',
  fileName: 'a.md',
  body: 'body for a doc CPT 72148 ICD-10: M54.16',
  cptCodes: ['72148'],
  icd10Codes: ['M54.16'],
  tags: ['mri'],
  ...overrides,
})

describe('CommercialGuidelineSearchTool', () => {
  beforeEach(() => {
    mockedLoad.mockReset()
  })

  it('returns no-match error when no docs', async () => {
    mockedLoad.mockReturnValue([])
    const tool = new CommercialGuidelineSearchTool()
    const out = await tool._call({ query: 'q', maxResults: 5 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/No matching commercial guideline/)
  })

  it('returns ranked results', async () => {
    mockedLoad.mockReturnValue([baseDoc()])
    const tool = new CommercialGuidelineSearchTool()
    const out = await tool._call({ query: 'mri', cpt: '72148', maxResults: 5 })
    const parsed = JSON.parse(out)
    expect(parsed.topMatches.length).toBeGreaterThan(0)
  })

  it('shrinks oversized output while preserving structured shape', async () => {
    // Distinct enough that the merge step (treatment overlap >70% or shared
    // CPT/ICD-10) does NOT fold them into one merged result.
    const adjectives = [
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      'Epsilon',
      'Zeta',
      'Eta',
      'Theta',
      'Iota',
      'Kappa',
    ]
    const nouns = [
      'Imaging',
      'Surgery',
      'Biopsy',
      'Ablation',
      'Resection',
      'Reconstruction',
      'Mapping',
      'Catheterization',
      'Stimulation',
      'Embolization',
    ]
    const docs = Array.from({ length: 200 }, (_, i) =>
      baseDoc({
        id: `id-${i}`,
        path: `/p/${i}.md`,
        title: `${adjectives[i % 10]} ${nouns[Math.floor(i / 10) % 10]} Variant ${i}`,
        treatment: `${adjectives[i % 10]} ${nouns[Math.floor(i / 10) % 10]} Variant ${i}`,
        cptCodes: [String(70000 + i)],
        icd10Codes: [`Z${(i % 90) + 10}.${i % 10}`],
        body: 'mri ' + 'matching content '.repeat(200),
      })
    )
    mockedLoad.mockReturnValue(docs)
    const tool = new CommercialGuidelineSearchTool()
    const out = await tool._call({
      query: 'mri',
      maxResults: 200,
    })
    const parsed = JSON.parse(out)
    expect(out.length).toBeLessThanOrEqual(30_000)
    expect(Array.isArray(parsed.topMatches)).toBe(true)
    expect(parsed.topMatches.length).toBeGreaterThan(0)
    expect(parsed.truncated).toBeDefined()
    expect(parsed.truncated.originalTopMatches).toBeGreaterThan(parsed.topMatches.length)
    // Filesystem paths must never be returned to the agent.
    for (const m of parsed.topMatches) {
      expect(m.path).toBeUndefined()
    }
  })

  it('handles loader exceptions', async () => {
    mockedLoad.mockImplementation(() => {
      throw new Error('boom')
    })
    const tool = new CommercialGuidelineSearchTool()
    const out = await tool._call({ query: 'q', maxResults: 5 })
    const parsed = JSON.parse(out)
    expect(parsed.error).toMatch(/boom/)
  })

  it('factory returns a tool instance', () => {
    expect(createCommercialGuidelineSearchTool()).toBeInstanceOf(CommercialGuidelineSearchTool)
  })
})
