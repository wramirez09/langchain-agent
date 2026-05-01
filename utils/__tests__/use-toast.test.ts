import { renderHook, act } from '@testing-library/react'
import { reducer, useToast, toast } from '../use-toast'

const mkToast = (id: string, extra: any = {}) => ({
  id,
  open: true,
  ...extra,
})

describe('use-toast reducer', () => {
  it('ADD_TOAST inserts and respects limit (1)', () => {
    let s: any = { toasts: [] }
    s = reducer(s, { type: 'ADD_TOAST', toast: mkToast('1') as any })
    s = reducer(s, { type: 'ADD_TOAST', toast: mkToast('2') as any })
    expect(s.toasts).toHaveLength(1)
    expect(s.toasts[0].id).toBe('2')
  })

  it('UPDATE_TOAST merges fields', () => {
    let s: any = { toasts: [mkToast('1', { title: 'a' })] }
    s = reducer(s, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'b' } as any,
    })
    expect(s.toasts[0].title).toBe('b')
  })

  it('DISMISS_TOAST closes a single toast', () => {
    jest.useFakeTimers()
    try {
      let s: any = { toasts: [mkToast('1'), mkToast('2')] }
      s = reducer(s, { type: 'DISMISS_TOAST', toastId: '1' })
      expect(s.toasts.find((t: any) => t.id === '1').open).toBe(false)
      expect(s.toasts.find((t: any) => t.id === '2').open).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('DISMISS_TOAST without id closes all', () => {
    jest.useFakeTimers()
    try {
      let s: any = { toasts: [mkToast('1'), mkToast('2')] }
      s = reducer(s, { type: 'DISMISS_TOAST' })
      expect(s.toasts.every((t: any) => t.open === false)).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('REMOVE_TOAST removes by id', () => {
    let s: any = { toasts: [mkToast('1'), mkToast('2')] }
    s = reducer(s, { type: 'REMOVE_TOAST', toastId: '1' })
    expect(s.toasts).toHaveLength(1)
    expect(s.toasts[0].id).toBe('2')
  })

  it('REMOVE_TOAST without id clears all', () => {
    let s: any = { toasts: [mkToast('1'), mkToast('2')] }
    s = reducer(s, { type: 'REMOVE_TOAST' } as any)
    expect(s.toasts).toEqual([])
  })
})

describe('toast() and useToast()', () => {
  it('adds a toast and exposes dismiss/update', () => {
    const { result } = renderHook(() => useToast())
    let handle: any
    act(() => {
      handle = toast({ title: 'hello' } as any)
    })
    expect(result.current.toasts[0].title).toBe('hello')
    act(() => handle.update({ id: handle.id, title: 'world' } as any))
    expect(result.current.toasts[0].title).toBe('world')
    act(() => handle.dismiss())
    expect(result.current.toasts[0].open).toBe(false)
  })

  it('dismiss() from useToast closes', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'x' } as any)
    })
    act(() => result.current.dismiss())
    expect(result.current.toasts.every((t: any) => !t.open)).toBe(true)
  })

  it('triggers onOpenChange dismiss path', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'auto-dismiss' } as any)
    })
    const t = result.current.toasts[0] as any
    act(() => t.onOpenChange(false))
    expect(result.current.toasts[0].open).toBe(false)
  })
})
