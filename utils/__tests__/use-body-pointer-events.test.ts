import { renderHook } from '@testing-library/react'
import { useBodyPointerEvents } from '../use-body-pointer-events'

describe('useBodyPointerEvents', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = ''
  })

  it('disables pointer events when shouldDisable=true', () => {
    renderHook(() => useBodyPointerEvents(true))
    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('keeps pointer events when shouldDisable=false', () => {
    renderHook(() => useBodyPointerEvents(false))
    expect(document.body.style.pointerEvents).toBe('auto')
  })

  it('resets to auto on unmount', () => {
    const { unmount } = renderHook(() => useBodyPointerEvents(true))
    unmount()
    expect(document.body.style.pointerEvents).toBe('auto')
  })
})
