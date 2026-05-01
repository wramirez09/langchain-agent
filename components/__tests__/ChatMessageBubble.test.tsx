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
  it('renders user message content', () => {
    render(
      <ChatMessageBubble
        message={{ id: '1', role: 'user', content: 'hello' } as any}
      />,
    )
    expect(screen.getByTestId('md').textContent).toBe('hello')
  })

  it('renders assistant message with disclaimer when last and not loading', () => {
    render(
      <ChatMessageBubble
        message={{ id: '1', role: 'assistant', content: 'response body' } as any}
        isLastMessage
      />,
    )
    expect(screen.getByText(/Always verify with payer portal/)).toBeInTheDocument()
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
