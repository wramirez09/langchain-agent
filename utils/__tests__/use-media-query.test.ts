import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../use-media-query'

function setupMatchMedia(matches: boolean) {
  const listeners: any[] = []
  const mql = {
    matches,
    media: '',
    addListener: (cb: any) => listeners.push(cb),
    removeListener: (cb: any) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    },
    addEventListener: (_: string, cb: any) => listeners.push(cb),
    removeEventListener: (_: string, cb: any) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    },
    onchange: null,
    dispatchEvent: jest.fn(),
  }
  ;(window as any).matchMedia = jest.fn().mockReturnValue(mql)
  return {
    fire(newMatches: boolean) {
      mql.matches = newMatches
      listeners.forEach((cb) => cb({ matches: newMatches }))
    },
  }
}

describe('useMediaQuery', () => {
  it('returns initial match', () => {
    setupMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 100px)'))
    expect(result.current).toBe(true)
  })

  it('updates when media query event fires', () => {
    const ctl = setupMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 100px)'))
    expect(result.current).toBe(false)
    act(() => ctl.fire(true))
    expect(result.current).toBe(true)
  })

  it('falls back to defaultValue when initializeWithValue=false then syncs', () => {
    setupMatchMedia(true)
    const { result } = renderHook(() =>
      useMediaQuery('(min-width: 100px)', {
        defaultValue: false,
        initializeWithValue: false,
      })
    )
    // After mount the layout effect syncs to actual matchMedia value.
    expect(result.current).toBe(true)
  })
})
