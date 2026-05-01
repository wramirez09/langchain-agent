jest.mock('../commercialGuidelineMetadataIndex', () => {
  const mockIndex = [
    {
      id: 'a',
      title: 'MRI Lumbar',
      domain: 'spine',
      path: '/p/a.md',
      fileName: 'a.md',
      sourceGroup: 'plaintextspine',
      cptCodes: ['72148'],
      icd10Codes: ['M54.16'],
      keywords: ['mri'],
      specialty: ['orthopedic'],
      procedures: ['mri lumbar'],
      aliases: ['lumbar mri'],
      relatedConditions: ['back pain'],
      priority: 'high',
    },
    {
      id: 'b',
      title: 'Cardiac Cath',
      domain: 'cardio',
      path: '/p/b.md',
      fileName: 'b.md',
      sourceGroup: 'plaintextcardio',
      cptCodes: ['93458'],
      icd10Codes: ['I25.10'],
      keywords: ['cardiac'],
      relatedConditions: ['chest pain'],
    },
  ]
  return {
    loadMetadataIndex: () => mockIndex,
    loadDocumentContent: (filePath: string) =>
      `Body content for ${filePath}. CPT 72148. ICD-10: M54.16`,
    filterMetadataByQuery: jest.requireActual(
      '../commercialGuidelineMetadataIndex'
    ).filterMetadataByQuery,
  }
})

import {
  getMetadataIndex,
  loadRelevantDocuments,
  loadAllDocuments,
} from '../commercialGuidelineLoaderOptimized'

describe('commercialGuidelineLoaderOptimized', () => {
  it('exposes the metadata index', () => {
    const idx = getMetadataIndex()
    expect(idx).toHaveLength(2)
    expect(idx[0].id).toBe('a')
  })

  it('loads only relevant documents based on query', () => {
    const docs = loadRelevantDocuments({ query: 'mri', cpt: '72148', maxResults: 5 })
    expect(docs.length).toBe(1)
    expect(docs[0].id).toBe('a')
    expect(docs[0].sourceType).toBe('commercial-guideline')
    expect(docs[0].cptCodes).toContain('72148')
    expect(docs[0].priority).toBe('high')
  })

  it('falls back to all docs when filter eliminates everything', () => {
    const docs = loadRelevantDocuments({ query: 'q', domain: 'unmapped-domain', maxResults: 5 })
    expect(docs).toHaveLength(2)
  })

  it('handles array CPT/ICD inputs', () => {
    const docs = loadRelevantDocuments({
      query: 'q',
      cpt: ['72148', '93458'],
      icd10: ['M54.16', 'I25.10'],
      maxResults: 5,
    })
    expect(docs).toHaveLength(2)
  })

  it('loadAllDocuments returns all metadata mapped to full docs', () => {
    const docs = loadAllDocuments()
    expect(docs).toHaveLength(2)
    expect(docs[0].body).toContain('Body content for')
  })
})
