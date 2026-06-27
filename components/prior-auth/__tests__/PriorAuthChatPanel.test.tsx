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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorAuthChatPanel } from '../PriorAuthChatPanel'
import { PriorAuthProvider } from '../../providers/PriorAuthProvider'

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
