import { useEffect } from 'react'
import { render, screen, act } from '@testing-library/react'
import {
  MobileSidebarProvider,
  useMobileSidebar,
} from '../MobileSidebarProvider'

function Probe() {
  const ctx = useMobileSidebar()
  // Published from an effect rather than during render — writing to an
  // external binding mid-render is a side effect React may discard or replay.
  // No dep array, so `__msb` tracks the latest context after every commit.
  useEffect(() => {
    ;(globalThis as any).__msb = ctx
  })
  return <div data-testid="open">{String(ctx.isOpen)}</div>
}

describe('MobileSidebarProvider', () => {
  it('starts closed and toggles open', () => {
    render(
      <MobileSidebarProvider>
        <Probe />
      </MobileSidebarProvider>
    )
    expect(screen.getByTestId('open').textContent).toBe('false')
    act(() => (globalThis as any).__msb.toggleIsOpen())
    expect(screen.getByTestId('open').textContent).toBe('true')
  })

  it('setIsOpen sets explicit value', () => {
    render(
      <MobileSidebarProvider>
        <Probe />
      </MobileSidebarProvider>
    )
    act(() => (globalThis as any).__msb.setIsOpen(true))
    expect(screen.getByTestId('open').textContent).toBe('true')
    act(() => (globalThis as any).__msb.setIsOpen(false))
    expect(screen.getByTestId('open').textContent).toBe('false')
  })

  it('default context returns no-op outside provider', () => {
    render(<Probe />)
    expect(screen.getByTestId('open').textContent).toBe('false')
    // setIsOpen is a no-op; should not throw
    expect(() => (globalThis as any).__msb.setIsOpen(true)).not.toThrow()
    expect(() => (globalThis as any).__msb.toggleIsOpen()).not.toThrow()
  })
})
