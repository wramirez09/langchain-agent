const embedDocumentsMock = jest.fn()
jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: class {
    embedDocuments = (...a: any[]) => embedDocumentsMock(...a)
  },
}))

import { cache } from '../cache'
import { cosine, embedMany, EMBEDDING_DIMS, EMBEDDING_MODEL } from '../embeddings'

describe('cosine', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = new Float32Array([1, 0, 0])
    expect(cosine(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0)
  })

  it('returns the dot product (cosine for unit vectors)', () => {
    const a = new Float32Array([0.6, 0.8])
    const b = new Float32Array([0.8, 0.6])
    expect(cosine(a, b)).toBeCloseTo(0.96)
  })

  it('compares over the shorter length when sizes differ', () => {
    expect(cosine(new Float32Array([1, 1, 1]), new Float32Array([2, 3]))).toBe(5)
  })
})

describe('embedMany', () => {
  beforeEach(() => {
    cache.clear()
    embedDocumentsMock.mockReset()
  })

  it('serves repeat texts from cache and only sends the misses', async () => {
    embedDocumentsMock.mockResolvedValueOnce([[1, 0]]).mockResolvedValueOnce([[0, 1]])

    await embedMany(['a'])
    await embedMany(['a', 'b'])

    expect(embedDocumentsMock).toHaveBeenNthCalledWith(1, ['a'])
    expect(embedDocumentsMock).toHaveBeenNthCalledWith(2, ['b'])
  })

  it('keeps results aligned to input order when some texts are cached', async () => {
    embedDocumentsMock.mockResolvedValueOnce([[9, 9]])
    await embedMany(['cached'])
    embedDocumentsMock.mockResolvedValueOnce([[1, 1], [2, 2]])

    const out = await embedMany(['fresh-1', 'cached', 'fresh-2'])

    expect(Array.from(out[0])).toEqual([1, 1])
    expect(Array.from(out[1])).toEqual([9, 9])
    expect(Array.from(out[2])).toEqual([2, 2])
  })

  // Ingestion passes useCache: false. The index is the durable store, so a hit
  // saves nothing on a later run and would let one bad cached vector be
  // re-persisted as though it were freshly computed.
  it('bypasses the cache entirely when useCache is false', async () => {
    embedDocumentsMock.mockResolvedValueOnce([[1, 0]])
    await embedMany(['doc'])
    embedDocumentsMock.mockResolvedValueOnce([[0, 1]])

    const out = await embedMany(['doc'], { useCache: false })

    expect(embedDocumentsMock).toHaveBeenNthCalledWith(2, ['doc'])
    expect(Array.from(out[0])).toEqual([0, 1])
    // …and the bypass does not overwrite what other callers already cached.
    embedDocumentsMock.mockClear()
    const cached = await embedMany(['doc'])
    expect(embedDocumentsMock).not.toHaveBeenCalled()
    expect(Array.from(cached[0])).toEqual([1, 0])
  })
})

describe('embedding constants', () => {
  it('exposes the shared model + dimension', () => {
    expect(EMBEDDING_MODEL).toBe('text-embedding-3-small')
    expect(EMBEDDING_DIMS).toBe(1536)
  })
})
