import { buildBm25Index, bm25Score } from '../bm25'

const corpus = [
  'MRI of the knee for suspected meniscal tear', // 0
  'MRI of the lumbar spine for back pain', // 1
  'CT scan of the abdomen', // 2
  'physical therapy for knee pain', // 3
]

describe('buildBm25Index', () => {
  it('captures corpus size and a positive average document length', () => {
    const index = buildBm25Index(corpus)
    expect(index.N).toBe(4)
    expect(index.avgdl).toBeGreaterThan(0)
    expect(index.docTokens).toHaveLength(4)
  })

  it('records document frequency per term', () => {
    const index = buildBm25Index(corpus)
    // "knee" appears in docs 0 and 3
    expect(index.df.get('knee')).toBe(2)
    // "meniscal" appears only in doc 0
    expect(index.df.get('meniscal')).toBe(1)
  })

  it('handles an empty corpus', () => {
    const index = buildBm25Index([])
    expect(index.N).toBe(0)
    expect(index.avgdl).toBe(0)
  })
})

describe('bm25Score', () => {
  it('only scores documents that contain a query term', () => {
    const index = buildBm25Index(corpus)
    const scores = bm25Score(index, 'meniscal tear')
    expect([...scores.keys()]).toEqual([0])
    expect(scores.get(0)).toBeGreaterThan(0)
  })

  it('ranks the most relevant document highest', () => {
    const index = buildBm25Index(corpus)
    const scores = bm25Score(index, 'knee pain')
    // doc 3 ("physical therapy for knee pain") matches both terms
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
    expect(ranked[0][0]).toBe(3)
    expect(scores.has(0)).toBe(true) // doc 0 matches "knee" only
  })

  it('returns an empty map for a query with no indexed terms', () => {
    const index = buildBm25Index(corpus)
    expect(bm25Score(index, 'cardiology').size).toBe(0)
    expect(bm25Score(index, 'the and for').size).toBe(0)
  })
})
