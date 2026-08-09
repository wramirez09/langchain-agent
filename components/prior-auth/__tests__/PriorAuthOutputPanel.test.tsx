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

describe('PriorAuthOutputPanel — progress while the report is withheld', () => {
  const { encodeFrame } = require('@/lib/priorAuth/streamFrames')

  const framesOnly = (...f: any[]) => f.map(encodeFrame).join('')

  // The server now buffers the report until it has been checked, so for most
  // of a run the only assistant content is control frames. Before this, the
  // report painting token-by-token *was* the progress indicator.
  it('shows research progress when only frames have arrived', () => {
    render(
      <PriorAuthOutputPanel
        messages={[
          {
            id: '1',
            role: 'assistant',
            content: framesOnly(
              { t: 'tool', name: 'commercial_guidelines_search', status: 'running' },
            ),
          } as any,
        ]}
        isProcessing
      />
    )
    expect(screen.getByText('Searching payer guidelines')).toBeInTheDocument()
    expect(screen.queryByTestId('bubble')).not.toBeInTheDocument()
  })

  it('reports the review phase once research is done', () => {
    render(
      <PriorAuthOutputPanel
        messages={[
          {
            id: '1',
            role: 'assistant',
            content: framesOnly(
              { t: 'tool', name: 'medicare_multi_search', status: 'done' },
              { t: 'phase', v: 'reviewing' },
            ),
          } as any,
        ]}
        isProcessing
      />
    )
    expect(screen.getByText('Validating results…')).toBeInTheDocument()
  })

  // Frames precede the answer, so the artifact heuristic has to run against
  // the stripped body or a finished report is mistaken for plain text.
  it('recognises an artifact that arrived behind progress frames', () => {
    // jsdom has no IntersectionObserver; the document's scroll-spy needs one.
    ;(globalThis as any).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    const { ARTIFACT_JSON_EXAMPLE } = require('@/lib/priorAuth/artifactSchema')
    render(
      <PriorAuthOutputPanel
        messages={[
          {
            id: '1',
            role: 'assistant',
            content:
              framesOnly({ t: 'tool', name: 'search', status: 'done' }) +
              ARTIFACT_JSON_EXAMPLE,
          } as any,
        ]}
        isProcessing={false}
      />
    )
    // Rendered as the full document, not as a chat bubble.
    expect(screen.queryByTestId('bubble')).not.toBeInTheDocument()
    expect(screen.getByText(/On this page/i)).toBeInTheDocument()
  })

  it('still shows the empty state before a run starts', () => {
    render(<PriorAuthOutputPanel messages={[]} isProcessing={false} />)
    expect(screen.getByText(/No output yet/)).toBeInTheDocument()
  })
})
