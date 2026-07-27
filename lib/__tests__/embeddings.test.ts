// Only the pure `cosine` helper is under test; stub the OpenAI client so the
// module loads without the real @langchain/openai dependency.
jest.mock('@langchain/openai', () => ({ OpenAIEmbeddings: class {} }))

import { cosine, EMBEDDING_DIMS, EMBEDDING_MODEL } from '../embeddings'

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

describe('embedding constants', () => {
  it('exposes the shared model + dimension', () => {
    expect(EMBEDDING_MODEL).toBe('text-embedding-3-small')
    expect(EMBEDDING_DIMS).toBe(1536)
  })
})
