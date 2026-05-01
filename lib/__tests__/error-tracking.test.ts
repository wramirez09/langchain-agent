import {
  errorTracker,
  trackRetryError,
  createClientErrorNotification,
} from '../error-tracking'

describe('errorTracker', () => {
  it('categorizes by message keyword', () => {
    expect(errorTracker.categorizeError(new Error('OpenAI rate'))).toBe('llm')
    expect(errorTracker.categorizeError(new Error('supabase down'))).toBe('database')
    expect(errorTracker.categorizeError(new Error('stripe error'))).toBe('external_api')
    expect(errorTracker.categorizeError(new Error('schema invalid'))).toBe('validation')
    expect(errorTracker.categorizeError(new Error('network timeout'))).toBe('network')
    expect(errorTracker.categorizeError(new Error('asdf'))).toBe('unknown')
  })

  it('determines severity from message + attempts', () => {
    expect(errorTracker.determineSeverity(new Error('invalid api key'))).toBe('critical')
    expect(errorTracker.determineSeverity(new Error('timeout'), 3)).toBe('high')
    expect(errorTracker.determineSeverity(new Error('database connection'))).toBe('medium')
    expect(errorTracker.determineSeverity(new Error('temporary blip'))).toBe('low')
    expect(errorTracker.determineSeverity(new Error('???'))).toBe('medium')
  })

  it('tracks an error and assigns an id', () => {
    const e = errorTracker.trackError(new Error('boom'), 'ctx', 1, 'u1', 'r1', 'op')
    expect(e.id).toMatch(/^err_/)
    expect(errorTracker.getErrorById(e.id)).toBeDefined()
  })

  it('creates client notifications mapped from severity', () => {
    const e = errorTracker.trackError(new Error('rate limit'), 'ctx', 1)
    const note = errorTracker.createClientNotification(e)
    expect(note.userMessage.length).toBeGreaterThan(0)
    expect(note.severity).toBe('warning')
  })

  it('marks resolved errors', () => {
    const e = errorTracker.trackError(new Error('x'))
    errorTracker.resolveError(e.id)
    expect(errorTracker.getErrorById(e.id)?.resolved).toBe(true)
  })

  it('returns stats', () => {
    errorTracker.trackError(new Error('llm fail'))
    const stats = errorTracker.getErrorStats()
    expect(stats.total).toBeGreaterThan(0)
    expect(typeof stats.byCategory).toBe('object')
  })

  it('caps client notifications to 50', () => {
    for (let i = 0; i < 60; i++) {
      const e = errorTracker.trackError(new Error('test'))
      errorTracker.createClientNotification(e)
    }
    expect(errorTracker.getClientNotifications(undefined, 100).length).toBeLessThanOrEqual(50)
  })

  it('generates user-friendly messages per category', () => {
    const llmCrit = errorTracker.createClientNotification({
      ...errorTracker.trackError(new Error('llm thing')),
      severity: 'critical',
      category: 'llm',
    } as any)
    expect(llmCrit.userMessage).toMatch(/AI service/)

    const dbCrit = errorTracker.createClientNotification({
      ...errorTracker.trackError(new Error('database')),
      severity: 'critical',
      category: 'database',
    } as any)
    expect(dbCrit.userMessage).toMatch(/Data service/)

    const extCrit = errorTracker.createClientNotification({
      ...errorTracker.trackError(new Error('stripe')),
      severity: 'critical',
      category: 'external_api',
    } as any)
    expect(extCrit.userMessage).toMatch(/External service/)

    const valid = errorTracker.createClientNotification({
      ...errorTracker.trackError(new Error('invalid')),
      category: 'validation',
    } as any)
    expect(valid.userMessage).toMatch(/Invalid request/)

    const net = errorTracker.createClientNotification({
      ...errorTracker.trackError(new Error('network')),
      category: 'network',
      attempts: 2,
    } as any)
    expect(net.userMessage).toMatch(/Network/)

    const unk = errorTracker.createClientNotification({
      ...errorTracker.trackError(new Error('?')),
      category: 'unknown',
      attempts: 1,
    } as any)
    expect(unk.userMessage.length).toBeGreaterThan(0)
  })
})

describe('helpers', () => {
  it('trackRetryError forwards to errorTracker', () => {
    const e = trackRetryError(new Error('oops'), 'ctx', 2, 'u', 'op')
    expect(e.id).toMatch(/^err_/)
  })

  it('createClientErrorNotification works on info', () => {
    const info = trackRetryError(new Error('q'))
    const note = createClientErrorNotification(info)
    expect(note.id).toBe(info.id)
  })
})
