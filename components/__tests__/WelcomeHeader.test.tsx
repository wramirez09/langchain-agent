import { render, screen, act } from '@testing-library/react'
import { WelcomeHeader } from '../WelcomeHeader'

describe('WelcomeHeader', () => {
  it('renders when visible', () => {
    render(<WelcomeHeader isVisible={true} onFadeOut={() => {}} />)
    expect(screen.getByText('NoteDoctor.ai')).toBeInTheDocument()
    expect(screen.getByText(/HIPAA Compliant/)).toBeInTheDocument()
  })

  it('returns null when not visible', () => {
    const { container } = render(
      <WelcomeHeader isVisible={false} onFadeOut={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('calls onFadeOut after 500ms when becoming hidden', () => {
    jest.useFakeTimers()
    const onFadeOut = jest.fn()
    const { rerender } = render(
      <WelcomeHeader isVisible={true} onFadeOut={onFadeOut} />
    )
    rerender(<WelcomeHeader isVisible={false} onFadeOut={onFadeOut} />)
    act(() => jest.advanceTimersByTime(500))
    expect(onFadeOut).toHaveBeenCalled()
    jest.useRealTimers()
  })
})
