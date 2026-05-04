jest.mock('../utils/cmsCoverageApiClient', () => ({
  cmsCoverageApiClient: {
    fetchNcd: jest.fn(),
    fetchLcd: jest.fn(),
    fetchArticle: jest.fn(),
  },
}))

import { medicarePolicyDetailTool } from '../medicarePolicyDetailTool'
import { cmsCoverageApiClient } from '../utils/cmsCoverageApiClient'

const fetchNcd = cmsCoverageApiClient.fetchNcd as jest.Mock
const fetchLcd = cmsCoverageApiClient.fetchLcd as jest.Mock
const fetchArticle = cmsCoverageApiClient.fetchArticle as jest.Mock

const sampleDetails = {
  priorAuthRequired: 'YES' as const,
  medicalNecessityCriteria: ['criterion A'],
  icd10Codes: [{ code: 'E11.65', description: 'Type 2', context: 'supports medical necessity' }],
  cptCodes: [{ code: '95250', description: 'CGM', context: 'covered procedure code' }],
  requiredDocumentation: ['doc 1'],
  limitationsExclusions: ['limit 1'],
  summary: 'A summary.',
}

describe('medicarePolicyDetailTool', () => {
  beforeEach(() => {
    fetchNcd.mockReset()
    fetchLcd.mockReset()
    fetchArticle.mockReset()
  })

  it('routes ncd to fetchNcd and returns ExtractedPolicyDetails wire shape', async () => {
    fetchNcd.mockResolvedValue(sampleDetails)
    const out = await medicarePolicyDetailTool._call({
      documentType: 'ncd',
      documentId: '123',
      documentVersion: 4,
    } as any)
    const parsed = JSON.parse(out)
    expect(fetchNcd).toHaveBeenCalledWith('123', 4)
    expect(fetchLcd).not.toHaveBeenCalled()
    expect(parsed.priorAuthRequired).toBe('YES')
    expect(parsed.documentType).toBe('ncd')
    expect(parsed.icd10Codes[0].code).toBe('E11.65')
  })

  it('routes lcd to fetchLcd', async () => {
    fetchLcd.mockResolvedValue(sampleDetails)
    await medicarePolicyDetailTool._call({
      documentType: 'lcd',
      documentId: 'L99',
      documentVersion: 1,
    } as any)
    expect(fetchLcd).toHaveBeenCalledWith('L99', 1)
  })

  it('routes article to fetchArticle', async () => {
    fetchArticle.mockResolvedValue(sampleDetails)
    await medicarePolicyDetailTool._call({
      documentType: 'article',
      documentId: 'A12',
      documentVersion: 2,
    } as any)
    expect(fetchArticle).toHaveBeenCalledWith('A12', 2)
  })

  it('returns JSON error shape on client failure', async () => {
    fetchNcd.mockRejectedValue(new Error('boom'))
    const out = await medicarePolicyDetailTool._call({
      documentType: 'ncd',
      documentId: 'x',
      documentVersion: 0,
    } as any)
    const parsed = JSON.parse(out)
    expect(parsed.error).toBe('boom')
    expect(parsed.documentType).toBe('ncd')
    expect(parsed.documentId).toBe('x')
  })
})
