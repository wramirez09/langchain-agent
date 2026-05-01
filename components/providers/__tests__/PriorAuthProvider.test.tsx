import { render, screen, act, renderHook } from '@testing-library/react'
import {
  PriorAuthProvider,
  usePriorAuthForm,
  usePriorAuthChat,
  usePriorAuthUi,
  usePriorAuthContext,
} from '../PriorAuthProvider'

const wrapper = ({ children }: any) => (
  <PriorAuthProvider>{children}</PriorAuthProvider>
)

describe('PriorAuthProvider', () => {
  it('usePriorAuthForm starts with empty defaults', () => {
    const { result } = renderHook(() => usePriorAuthForm(), { wrapper })
    expect(result.current.formFields.guidelines).toBe('')
    expect(result.current.openAccordions).toEqual([])
  })

  it('updateFormField updates only the named slot', () => {
    const { result } = renderHook(() => usePriorAuthForm(), { wrapper })
    act(() => result.current.updateFormField('treatment', 'MRI'))
    expect(result.current.formFields.treatment).toBe('MRI')
    expect(result.current.formFields.diagnosis).toBe('')
  })

  it('resetForm clears all fields and accordions', () => {
    const { result } = renderHook(() => usePriorAuthForm(), { wrapper })
    act(() => {
      result.current.updateFormField('cptCodes', '72148')
      result.current.setOpenAccordions(['a'])
    })
    act(() => result.current.resetForm())
    expect(result.current.formFields.cptCodes).toBe('')
    expect(result.current.openAccordions).toEqual([])
  })

  it('usePriorAuthChat manages chat state', () => {
    const { result } = renderHook(() => usePriorAuthChat(), { wrapper })
    expect(result.current.chatMessages).toEqual([])
    expect(result.current.chatInput).toBe('')

    act(() => {
      result.current.setChatInput('hi')
      result.current.setIsLoading(true)
      result.current.setChatIsLoading(true)
      result.current.setIntermediateStepsLoading(true)
      result.current.setSourcesForMessages({ k: 'v' })
      result.current.setChatMessages([{ id: '1', role: 'user', content: 'q' } as any])
    })
    expect(result.current.chatInput).toBe('hi')
    expect(result.current.isLoading).toBe(true)
    expect(result.current.chatIsLoading).toBe(true)
    expect(result.current.intermediateStepsLoading).toBe(true)
    expect(result.current.sourcesForMessages).toEqual({ k: 'v' })
    expect(result.current.chatMessages).toHaveLength(1)
  })

  it('usePriorAuthUi sets active tab', () => {
    const { result } = renderHook(() => usePriorAuthUi(), { wrapper })
    expect(result.current.activeFormTab).toBe('pre-auth')
    act(() => result.current.setActiveFormTab('chat'))
    expect(result.current.activeFormTab).toBe('chat')
  })

  it('composite usePriorAuthContext.resetForm also clears chatInput', () => {
    const { result } = renderHook(() => usePriorAuthContext(), { wrapper })
    act(() => {
      result.current.updateFormField('treatment', 'X')
      result.current.setChatInput('hi')
    })
    act(() => result.current.resetForm())
    expect(result.current.formFields.treatment).toBe('')
    expect(result.current.chatInput).toBe('')
  })

  it('throws when used outside provider', () => {
    const Bad = () => {
      usePriorAuthForm()
      return null
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/usePriorAuthForm must be used within/)
    spy.mockRestore()
  })

  it('throws for chat hook outside provider', () => {
    const Bad = () => {
      usePriorAuthChat()
      return null
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/usePriorAuthChat/)
    spy.mockRestore()
  })

  it('throws for ui hook outside provider', () => {
    const Bad = () => {
      usePriorAuthUi()
      return null
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/usePriorAuthUi/)
    spy.mockRestore()
  })
})
