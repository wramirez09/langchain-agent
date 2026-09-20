jest.mock('@/components/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: any) => (
    <div data-testid="bubble">{message.content}</div>
  ),
}))
jest.mock('@/components/IntermediateStep', () => ({
  IntermediateStep: ({ message }: any) => (
    <div data-testid="step">{message.content}</div>
  ),
}))
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  },
}))

import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorAuthChatPanel } from '../PriorAuthChatPanel'
import { PriorAuthProvider } from '../../providers/PriorAuthProvider'
import { encodeFrame } from '@/lib/priorAuth/streamFrames'

const wrap = (ui: React.ReactNode) => (
  <PriorAuthProvider>{ui}</PriorAuthProvider>
)

const baseProps = {
  messages: [],
  sourcesForMessages: {},
  isProcessing: false,
  isLayoutSwapped: false,
  onSubmit: jest.fn(),
  onStop: jest.fn(),
  onClear: jest.fn(),
}

describe('PriorAuthChatPanel', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows empty-state greeting when no messages', () => {
    render(wrap(<PriorAuthChatPanel {...baseProps} />))
    expect(
      screen.getByText(/check your prior authorization readiness/i)
    ).toBeInTheDocument()
    // Clear button should not show without messages
    expect(screen.queryByText('Clear')).toBeNull()
  })

  it('shows Clear button and calls onClear when there are messages', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          onClear={onClear}
          messages={[{ id: '1', role: 'assistant', content: 'hi' } as any]}
        />
      )
    )
    await user.click(screen.getByText('Clear'))
    expect(onClear).toHaveBeenCalled()
  })

  it('renders ChatMessageBubble for assistant messages and IntermediateStep for system', () => {
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          messages={[
            { id: '1', role: 'assistant', content: 'hello' } as any,
            { id: '2', role: 'system', content: '{"action":{"name":"x"}}' } as any,
          ]}
        />
      )
    )
    expect(screen.getByTestId('bubble')).toHaveTextContent('hello')
    expect(screen.getByTestId('step')).toBeInTheDocument()
  })

  it('shows the artifact skeleton (not the greeting) while a saved query restores', () => {
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isRestoring
          messages={[{ id: 'u1', role: 'user', content: 'knee MRI' } as any]}
        />
      )
    )
    expect(screen.getByTestId('restore-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('bubble')).toHaveTextContent('knee MRI')
    expect(screen.queryByText(/Hello! I'm here to help/)).toBeNull()
  })

  it('shows the skeleton even before the restored user message lands', () => {
    render(wrap(<PriorAuthChatPanel {...baseProps} isRestoring messages={[]} />))
    expect(screen.getByTestId('restore-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/Hello! I'm here to help/)).toBeNull()
  })

  it('shows the pending skeleton under the user message while a generation is in flight', () => {
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isProcessing
          messages={[{ id: 'u1', role: 'user', content: 'knee MRI' } as any]}
        />
      )
    )
    expect(screen.getByTestId('pending-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('bubble')).toHaveTextContent('knee MRI')
  })

  it('keeps the pending skeleton while intermediate steps stream in', () => {
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isProcessing
          messages={[
            { id: 'u1', role: 'user', content: 'knee MRI' } as any,
            { id: 's1', role: 'system', content: '{"action":{"name":"x"}}' } as any,
          ]}
        />
      )
    )
    expect(screen.getByTestId('pending-skeleton')).toBeInTheDocument()
  })

  it('keeps the pending skeleton while the assistant message carries only progress frames', () => {
    // This is the long middle of a run: the assistant message exists, so the
    // bubble is rendering its rotating spinner, but nothing has been written
    // to the body yet.
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isProcessing
          messages={[
            { id: 'u1', role: 'user', content: 'knee MRI' } as any,
            {
              id: 'a1',
              role: 'assistant',
              content: encodeFrame({ t: 'tool', name: 'ncd_search', status: 'running' }),
            } as any,
          ]}
        />
      )
    )
    expect(screen.getByTestId('pending-skeleton')).toBeInTheDocument()
  })

  it('keeps the pending skeleton when a frame arrives half-written', () => {
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isProcessing
          messages={[
            { id: 'u1', role: 'user', content: 'knee MRI' } as any,
            { id: 'a1', role: 'assistant', content: '\u241E{"t":"to' } as any,
          ]}
        />
      )
    )
    expect(screen.getByTestId('pending-skeleton')).toBeInTheDocument()
  })

  it('removes the pending skeleton once the artifact starts streaming', () => {
    render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isProcessing
          messages={[
            { id: 'u1', role: 'user', content: 'knee MRI' } as any,
            { id: 'a1', role: 'assistant', content: '{"title":' } as any,
          ]}
        />
      )
    )
    expect(screen.queryByTestId('pending-skeleton')).toBeNull()
  })

  it('does not show the pending skeleton when idle or restoring', () => {
    const { rerender } = render(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          messages={[{ id: 'u1', role: 'user', content: 'knee MRI' } as any]}
        />
      )
    )
    expect(screen.queryByTestId('pending-skeleton')).toBeNull()
    // While restoring, the restore skeleton owns the slot.
    rerender(
      wrap(
        <PriorAuthChatPanel
          {...baseProps}
          isProcessing
          isRestoring
          messages={[{ id: 'u1', role: 'user', content: 'knee MRI' } as any]}
        />
      )
    )
    expect(screen.queryByTestId('pending-skeleton')).toBeNull()
    expect(screen.getByTestId('restore-skeleton')).toBeInTheDocument()
  })

  describe('jump to latest', () => {
    // jsdom reports every scroll metric as 0, which reads as "at the bottom".
    // Force the container to look scrolled up.
    const scrollUp = () => {
      const el = document.querySelector('[style*="overflow"]') as HTMLElement
      Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true })
      Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true })
      el.scrollTop = 0
      fireEvent.scroll(el)
      return el
    }

    const followUp = [
      { id: 'u1', role: 'user', content: 'knee MRI' },
      { id: 'a1', role: 'assistant', content: '{"title":"first report"}' },
      { id: 'u2', role: 'user', content: 'and for a hip?' },
    ] as any[]

    it('offers the button once a follow-up is pending and the view is scrolled up', () => {
      render(wrap(<PriorAuthChatPanel {...baseProps} isProcessing messages={followUp} />))
      expect(screen.queryByTestId('jump-to-latest')).toBeNull()
      scrollUp()
      expect(screen.getByTestId('pending-skeleton')).toBeInTheDocument()
      expect(screen.getByTestId('jump-to-latest')).toBeInTheDocument()
    })

    it('stays hidden on a first query — there is nothing above to scroll from', () => {
      render(
        wrap(
          <PriorAuthChatPanel
            {...baseProps}
            isProcessing
            messages={[{ id: 'u1', role: 'user', content: 'knee MRI' } as any]}
          />
        )
      )
      scrollUp()
      expect(screen.getByTestId('pending-skeleton')).toBeInTheDocument()
      expect(screen.queryByTestId('jump-to-latest')).toBeNull()
    })

    it('stays hidden when no skeleton is showing', () => {
      render(wrap(<PriorAuthChatPanel {...baseProps} messages={followUp} />))
      scrollUp()
      expect(screen.queryByTestId('jump-to-latest')).toBeNull()
    })

    it('scrolls to the end and dismisses itself when clicked', async () => {
      const user = userEvent.setup()
      Element.prototype.scrollIntoView = jest.fn()
      render(wrap(<PriorAuthChatPanel {...baseProps} isProcessing messages={followUp} />))
      scrollUp()
      await user.click(screen.getByTestId('jump-to-latest'))
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'end',
      })
      expect(screen.queryByTestId('jump-to-latest')).toBeNull()
    })
  })

  it('submit button calls onSubmit when not processing', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn((e?: any) => e?.preventDefault?.())
    render(
      wrap(<PriorAuthChatPanel {...baseProps} onSubmit={onSubmit} />)
    )
    await user.type(screen.getByPlaceholderText(/Type your message/), 'hello')
    await user.click(screen.getByRole('button', { name: '' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('button calls onStop when processing', async () => {
    const user = userEvent.setup()
    const onStop = jest.fn()
    render(
      wrap(<PriorAuthChatPanel {...baseProps} isProcessing={true} onStop={onStop} />)
    )
    const buttons = screen.getAllByRole('button')
    // The submit/stop button is the last one
    await user.click(buttons[buttons.length - 1])
    expect(onStop).toHaveBeenCalled()
  })
})
