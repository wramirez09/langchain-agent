jest.mock('@/components/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: any) => (
    <div data-testid="bubble">{message.content}</div>
  ),
}))

import { render, screen } from '@testing-library/react'
import { PriorAuthOutputPanel } from '../PriorAuthOutputPanel'

describe('PriorAuthOutputPanel', () => {
  it('renders empty-state when no assistant messages', () => {
    render(<PriorAuthOutputPanel messages={[]} isProcessing={false} />)
    expect(screen.getByText(/No output yet/)).toBeInTheDocument()
  })

  it('renders only assistant messages with content', () => {
    render(
      <PriorAuthOutputPanel
        messages={[
          { id: '1', role: 'user', content: 'q' } as any,
          { id: '2', role: 'assistant', content: 'a1' } as any,
          { id: '3', role: 'assistant', content: '' } as any,
          { id: '4', role: 'assistant', content: 'a2' } as any,
        ]}
        isProcessing={false}
      />
    )
    const bubbles = screen.getAllByTestId('bubble')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]).toHaveTextContent('a1')
    expect(bubbles[1]).toHaveTextContent('a2')
  })
})
