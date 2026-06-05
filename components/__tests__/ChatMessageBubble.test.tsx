jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  },
}))
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="md">{children}</div>,
}))

import { render, screen } from '@testing-library/react'
import { ChatMessageBubble } from '../ChatMessageBubble'

describe('ChatMessageBubble', () => {
  it('renders a plain user message as text (not via markdown)', () => {
    render(
      <ChatMessageBubble
        message={{ id: '1', role: 'user', content: 'hello' } as any}
      />,
    )
    // User messages render via UserRequestFields, not react-markdown. A
    // label-less message falls back to plain text.
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.queryByTestId('md')).toBeNull()
  })

  it('separates a serialized form message into labeled fields', () => {
    render(
      <ChatMessageBubble
        message={
          {
            id: '1',
            role: 'user',
            content:
              'Guidelines: Commercial. State: TX. Treatment: MRI Lumbar | Any priors needed?',
          } as any
        }
      />,
    )
    expect(screen.getByText('Your Request')).toBeInTheDocument()
    expect(screen.getByText('Guidelines')).toBeInTheDocument()
    expect(screen.getByText('Commercial')).toBeInTheDocument()
    expect(screen.getByText('Treatment')).toBeInTheDocument()
    expect(screen.getByText('MRI Lumbar')).toBeInTheDocument()
    // Trailing free-text after " | " becomes an Additional Notes field.
    expect(screen.getByText('Additional Notes')).toBeInTheDocument()
    expect(screen.getByText('Any priors needed?')).toBeInTheDocument()
  })

  it('renders assistant message content when last and not loading', () => {
    render(
      <ChatMessageBubble
        message={{ id: '1', role: 'assistant', content: 'response body' } as any}
        isLastMessage
      />,
    )
    // Non-artifact assistant text renders via the markdown renderer. (The
    // verify-note disclaimer now lives in the artifact's DisclaimerBlock.)
    expect(screen.getByTestId('md').textContent).toBe('response body')
  })

  it('shows rotating loading message when isLoading and no content yet', () => {
    render(
      <ChatMessageBubble
        message={{ id: '1', role: 'assistant', content: '' } as any}
        isLoading
        isLastMessage
      />,
    )
    expect(screen.getByText(/Analyzing authorization criteria/)).toBeInTheDocument()
  })

  it('returns null when no content and not loading', () => {
    const { container } = render(
      <ChatMessageBubble
        message={{ id: '1', role: 'assistant', content: '' } as any}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders sources block when sources provided', () => {
    render(
      <ChatMessageBubble
        message={{ id: '1', role: 'assistant', content: 'body' } as any}
        sources={[{ url: 'https://example.com', title: 'Example' }]}
      />,
    )
    expect(screen.getByText('Sources:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Example/ })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })
})
