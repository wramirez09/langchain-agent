import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ErrorNotification,
  ErrorNotificationManager,
  useErrorNotifications,
} from '../ErrorNotification'

const mkErr = (overrides: any = {}) => ({
  id: 'e1',
  timestamp: new Date('2024-01-01T12:00:00Z'),
  severity: 'error' as const,
  userMessage: 'Something went wrong',
  technicalMessage: 'TypeError: x is undefined',
  retryAttempts: 2,
  operation: 'op-x',
  canRetry: true,
  ...overrides,
})

describe('ErrorNotification', () => {
  it('renders user message and Error title', () => {
    render(<ErrorNotification error={mkErr()} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/Error/)).toBeInTheDocument()
  })

  it('shows retry button when canRetry and onRetry provided', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()
    render(<ErrorNotification error={mkErr()} onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /Retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('expands details on click', async () => {
    const user = userEvent.setup()
    render(<ErrorNotification error={mkErr()} />)
    await user.click(screen.getByRole('button', { name: /Details/i }))
    expect(screen.getByText(/TypeError: x is undefined/)).toBeInTheDocument()
    expect(screen.getByText(/Operation:/)).toBeInTheDocument()
  })

  it('calls onDismiss with id', async () => {
    const user = userEvent.setup()
    const onDismiss = jest.fn()
    render(<ErrorNotification error={mkErr()} onDismiss={onDismiss} />)
    const buttons = screen.getAllByRole('button')
    // dismiss is the last button (X icon)
    await user.click(buttons[buttons.length - 1])
    expect(onDismiss).toHaveBeenCalledWith('e1')
  })

  it('renders Critical Error title for critical severity', () => {
    render(<ErrorNotification error={mkErr({ severity: 'critical' })} />)
    expect(screen.getByText(/Critical Error/)).toBeInTheDocument()
  })

  it('renders Warning title for warning severity', () => {
    render(<ErrorNotification error={mkErr({ severity: 'warning' })} />)
    expect(screen.getByText(/Warning/)).toBeInTheDocument()
  })
})

describe('ErrorNotificationManager', () => {
  it('returns null when no errors', () => {
    const { container } = render(<ErrorNotificationManager errors={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('sorts by severity then timestamp', () => {
    const errors = [
      mkErr({ id: 'a', severity: 'warning', userMessage: 'W' }),
      mkErr({ id: 'b', severity: 'critical', userMessage: 'C' }),
      mkErr({ id: 'c', severity: 'error', userMessage: 'E' }),
    ]
    render(<ErrorNotificationManager errors={errors} />)
    const items = screen.getAllByText(/^[WCE]$/).map((el) => el.textContent)
    expect(items[0]).toBe('C')
    expect(items[1]).toBe('E')
    expect(items[2]).toBe('W')
  })

  it('respects maxVisible', () => {
    const errors = Array.from({ length: 5 }, (_, i) =>
      mkErr({ id: `${i}`, userMessage: `m${i}` })
    )
    render(<ErrorNotificationManager errors={errors} maxVisible={2} />)
    expect(screen.getAllByText(/^m\d$/)).toHaveLength(2)
  })

  it('calls onRetry with id', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()
    render(
      <ErrorNotificationManager errors={[mkErr({ id: 'x' })]} onRetry={onRetry} />
    )
    await user.click(screen.getByRole('button', { name: /Retry/i }))
    expect(onRetry).toHaveBeenCalledWith('x')
  })
})

describe('useErrorNotifications', () => {
  function Harness() {
    const ctx = useErrorNotifications()
    ;(globalThis as any).__hookCtx = ctx
    return <div>{ctx.errors.length}</div>
  }

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('addError appends a new error and auto-dismisses warnings after 10s', () => {
    render(<Harness />)
    const ctx = (globalThis as any).__hookCtx
    act(() => ctx.addError({ severity: 'warning', userMessage: 'w' }))
    expect((globalThis as any).__hookCtx.errors).toHaveLength(1)
    act(() => jest.advanceTimersByTime(10_000))
    expect((globalThis as any).__hookCtx.errors).toHaveLength(0)
  })

  it('errors auto-dismiss after 30s', () => {
    render(<Harness />)
    act(() =>
      (globalThis as any).__hookCtx.addError({ severity: 'error', userMessage: 'e' })
    )
    act(() => jest.advanceTimersByTime(30_000))
    expect((globalThis as any).__hookCtx.errors).toHaveLength(0)
  })

  it('dismissError removes by id', () => {
    render(<Harness />)
    act(() =>
      (globalThis as any).__hookCtx.addError({
        severity: 'error',
        userMessage: 'e',
      })
    )
    const id = (globalThis as any).__hookCtx.errors[0].id
    act(() => (globalThis as any).__hookCtx.dismissError(id))
    expect((globalThis as any).__hookCtx.errors).toHaveLength(0)
  })

  it('clearAllErrors empties the list', () => {
    render(<Harness />)
    act(() => {
      ;(globalThis as any).__hookCtx.addError({ severity: 'error', userMessage: '1' })
      ;(globalThis as any).__hookCtx.addError({ severity: 'error', userMessage: '2' })
    })
    act(() => (globalThis as any).__hookCtx.clearAllErrors())
    expect((globalThis as any).__hookCtx.errors).toHaveLength(0)
  })

  it('retryError dismisses retryable errors', () => {
    render(<Harness />)
    act(() =>
      (globalThis as any).__hookCtx.addError({
        severity: 'error',
        userMessage: 'e',
        canRetry: true,
      })
    )
    const id = (globalThis as any).__hookCtx.errors[0].id
    act(() => (globalThis as any).__hookCtx.retryError(id))
    expect((globalThis as any).__hookCtx.errors).toHaveLength(0)
  })
})
