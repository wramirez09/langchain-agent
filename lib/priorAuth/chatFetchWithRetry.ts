// Wraps fetch for the chat endpoint so transient cold-start failures
// (network errors, 502/503/504) are retried silently before surfacing to
// the user. Retries are only safe BEFORE the server starts streaming —
// once we get a 2xx with a body, we return it untouched.

const DEFAULT_MAX_RETRIES = 2 // 3 total attempts
const DEFAULT_BACKOFF_MS = [800, 1600]
// Only retry on transient edge / cold-start signals. 500 is excluded —
// it usually means the agent ran and failed, so replaying just doubles
// cost and latency.
const RETRYABLE_STATUS = new Set([408, 425, 502, 503, 504])
// If the request was alive for longer than this before failing, the
// failure is not a cold start — don't retry.
const FAST_FAIL_BUDGET_MS = 10_000

export interface ChatFetchOptions {
  maxRetries?: number
  backoff?: number[]
  onRetry?: (attempt: number, reason: string) => void
}

export function createChatFetchWithRetry(
  options: ChatFetchOptions = {},
): typeof fetch {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoff = options.backoff ?? DEFAULT_BACKOFF_MS

  return async function chatFetch(input, init) {
    const signal = init?.signal ?? undefined
    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')

      const attemptStart = Date.now()
      try {
        const res = await fetch(input, init)
        const elapsed = Date.now() - attemptStart
        if (res.ok) return res
        if (
          !RETRYABLE_STATUS.has(res.status) ||
          attempt === maxRetries ||
          elapsed > FAST_FAIL_BUDGET_MS
        ) {
          return res
        }
        lastError = new Error(`HTTP ${res.status}`)
        options.onRetry?.(attempt + 1, `status ${res.status}`)
      } catch (err) {
        if (signal?.aborted) throw err
        const elapsed = Date.now() - attemptStart
        if (attempt === maxRetries || elapsed > FAST_FAIL_BUDGET_MS) throw err
        lastError = err
        options.onRetry?.(
          attempt + 1,
          err instanceof Error ? err.message : 'network error',
        )
      }

      const delay = backoff[attempt] ?? backoff[backoff.length - 1] ?? 1000
      await sleep(delay, signal)
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Chat fetch failed')
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
