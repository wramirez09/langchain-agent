import { cache, generateCacheKey, TTL } from '../cache'

describe('cache', () => {
  beforeEach(() => cache.clear())

  it('stores and retrieves values', () => {
    cache.set('k', { a: 1 })
    expect(cache.get('k')).toEqual({ a: 1 })
    expect(cache.has('k')).toBe(true)
  })

  it('returns null for missing key', () => {
    expect(cache.get('missing')).toBeNull()
    expect(cache.has('missing')).toBe(false)
  })

  it('expires after TTL', () => {
    jest.useFakeTimers()
    try {
      cache.set('k', 'v', 1000)
      expect(cache.get('k')).toBe('v')
      jest.advanceTimersByTime(1500)
      expect(cache.get('k')).toBeNull()
      expect(cache.has('k')).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('delete removes a key', () => {
    cache.set('k', 'v')
    expect(cache.delete('k')).toBe(true)
    expect(cache.delete('k')).toBe(false)
  })

  it('clear empties the cache', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBeNull()
  })
})

describe('generateCacheKey', () => {
  it('joins parts with colons', () => {
    expect(generateCacheKey('a', 'b', 'c')).toBe('a:b:c')
  })
})

describe('TTL constants', () => {
  it('exposes expected values', () => {
    expect(TTL.SHORT).toBe(60_000)
    expect(TTL.MEDIUM).toBe(5 * 60_000)
    expect(TTL.LONG).toBe(30 * 60_000)
    expect(TTL.VERY_LONG).toBe(60 * 60_000)
  })
})
