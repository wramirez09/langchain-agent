/**
 * @jest-environment node
 */

const loadMock = jest.fn()
jest.mock('langchain/document_loaders/fs/directory', () => ({
  DirectoryLoader: jest.fn().mockImplementation(() => ({
    load: () => loadMock(),
  })),
}))
jest.mock('langchain/document_loaders/fs/text', () => ({
  TextLoader: jest.fn(),
}))

import {
  loadCommercialGuidelines,
  resetDocumentCache,
} from '../commercialGuidelineLoader'

describe('loadCommercialGuidelines', () => {
  beforeEach(() => {
    resetDocumentCache()
    loadMock.mockReset()
  })

  it('parses front matter and merges metadata from filename + content', async () => {
    loadMock.mockResolvedValue([
      {
        pageContent: `---\ntitle: My Guideline\ndomain: cardiology\nspecialty: cardiology\nkeywords:\n  - foo\ncpt_codes:\n  - "12345"\n---\nBody mentions CPT 67890 and ICD M54.16. Special insulin therapy keyword keyword keyword.`,
        metadata: { source: '/some/dir/cardio/my-guideline.md' },
      },
    ])

    const docs = await loadCommercialGuidelines()
    expect(docs).toHaveLength(1)
    const d = docs[0]
    expect(d.title).toBe('My Guideline')
    expect(d.domain).toBe('cardiology')
    expect(d.cptCodes).toEqual(expect.arrayContaining(['12345', '67890']))
    expect(d.icd10Codes).toEqual(expect.arrayContaining(['M54.16']))
    expect(d.tags).toEqual(expect.arrayContaining(['foo']))
    expect(d.body).not.toMatch(/^---/)
    expect(d.id).toMatch(/^[a-f0-9]{12}$/)
  })

  it('returns the cached result on subsequent calls', async () => {
    loadMock.mockResolvedValue([
      {
        pageContent: 'plain text',
        metadata: { source: '/x/folder/file.txt' },
      },
    ])
    const a = await loadCommercialGuidelines()
    const b = await loadCommercialGuidelines()
    expect(a).toBe(b)
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('reuses an in-flight load promise', async () => {
    let resolve!: (v: any) => void
    loadMock.mockReturnValue(
      new Promise((res) => {
        resolve = res
      }),
    )
    const p1 = loadCommercialGuidelines()
    const p2 = loadCommercialGuidelines()
    resolve([])
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe(b)
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('propagates load errors and clears in-flight state', async () => {
    loadMock.mockRejectedValue(new Error('disk fail'))
    await expect(loadCommercialGuidelines()).rejects.toThrow('disk fail')
    loadMock.mockResolvedValue([])
    const docs = await loadCommercialGuidelines()
    expect(docs).toEqual([])
  })

  it('resetDocumentCache forces a reload', async () => {
    loadMock.mockResolvedValue([])
    await loadCommercialGuidelines()
    resetDocumentCache()
    await loadCommercialGuidelines()
    expect(loadMock).toHaveBeenCalledTimes(2)
  })
})
