import {
  withRetry,
  isRetryableError,
  RetryError,
  RETRY_CONFIGS,
  createRetryableOperation,
} from '../retry'

describe('isRetryableError', () => {
  it('default patterns', () => {
    expect(isRetryableError(new Error('Network timeout'), {})).toBe(true)
    expect(isRetryableError(new Error('Bad gateway'), {})).toBe(true)
    expect(isRetryableError(new Error('something nonsense'), {})).toBe(false)
  })

  it('non-retryable list overrides', () => {
    const opts = { nonRetryableErrors: ['authentication'] }
    expect(isRetryableError(new Error('Authentication failure'), opts)).toBe(false)
  })

  it('retryable list narrows scope', () => {
    const opts = { retryableErrors: ['rate limit'] }
    expect(isRetryableError(new Error('rate limit hit'), opts)).toBe(true)
    expect(isRetryableError(new Error('timeout'), opts)).toBe(false)
  })
})

describe('withRetry', () => {
  it('returns success on first attempt', async () => {
    const op = jest.fn().mockResolvedValue('ok')
    const r = await withRetry(op)
    expect(r.success).toBe(true)
    expect(r.data).toBe('ok')
    expect(r.attempts).toBe(1)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries retryable errors then succeeds', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error('network glitch'))
      .mockResolvedValueOnce('ok')
    const r = await withRetry(op, { initialDelay: 1, backoffMultiplier: 1 })
    expect(r.success).toBe(true)
    expect(r.attempts).toBe(2)
  })

  it('does not retry non-retryable errors', async () => {
    const op = jest.fn().mockRejectedValue(new Error('invalid input'))
    const r = await withRetry(op, { initialDelay: 1 })
    expect(r.success).toBe(false)
    expect(r.attempts).toBe(1)
    expect(r.error).toBeInstanceOf(RetryError)
  })

  it('exhausts retries and returns final failure', async () => {
    const op = jest.fn().mockRejectedValue(new Error('timeout'))
    const onRetry = jest.fn()
    const r = await withRetry(op, {
      initialDelay: 1,
      maxAttempts: 3,
      onRetry,
    })
    expect(r.success).toBe(false)
    expect(r.attempts).toBe(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})

describe('createRetryableOperation', () => {
  it('uses preset config', async () => {
    const op = jest.fn().mockResolvedValue('ok')
    const r = await createRetryableOperation(op, 'LLM_API', { initialDelay: 1 })
    expect(r.success).toBe(true)
  })
})

describe('RETRY_CONFIGS', () => {
  it('exposes preset configs', () => {
    expect(RETRY_CONFIGS.LLM_API.maxAttempts).toBe(3)
    expect(RETRY_CONFIGS.CRITICAL.maxAttempts).toBe(5)
  })
})
