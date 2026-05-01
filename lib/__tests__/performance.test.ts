import { measurePerformance, debounce, throttle } from '../performance'

describe('measurePerformance', () => {
  it('resolves with the wrapped fn result', async () => {
    const r = await measurePerformance('x', async () => 42)
    expect(r).toBe(42)
  })

  it('rejects when the wrapped fn throws', async () => {
    await expect(
      measurePerformance('y', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
  })
})

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('calls only once within wait', () => {
    const fn = jest.fn()
    const d = debounce(fn, 100)
    d(1)
    d(2)
    d(3)
    jest.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
  })
})

describe('throttle', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('allows the leading call and blocks subsequent within window', () => {
    const fn = jest.fn()
    const t = throttle(fn, 100)
    t(1)
    t(2)
    t(3)
    expect(fn).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(101)
    t(4)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
