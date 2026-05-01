import { render, screen, act } from '@testing-library/react'
import { AgentProgressPanel } from '../AgentProgressPanel'

describe('AgentProgressPanel', () => {
  it('shows preparing message when loading and no stages', () => {
    render(<AgentProgressPanel isLoading={true} stages={[]} messages={[]} />)
    expect(screen.getByText(/Analyzing your request/)).toBeInTheDocument()
    expect(screen.getByText(/Preparing tools/)).toBeInTheDocument()
  })

  it('shows processing label when loading with stages', () => {
    render(
      <AgentProgressPanel
        isLoading={true}
        stages={[{ tool: 't1', label: 'Step One', status: 'running' }]}
        messages={[]}
      />
    )
    expect(screen.getByText(/Processing authorization request/)).toBeInTheDocument()
    expect(screen.getByText('Step One')).toBeInTheDocument()
  })

  it('renders stage messages associated with their tool', () => {
    render(
      <AgentProgressPanel
        isLoading={true}
        stages={[{ tool: 't1', label: 'Step One', status: 'running' }]}
        messages={[
          { tool: 't1', text: 'Found 3 results', type: 'info' },
          { tool: 't1', text: 'Slow response', type: 'warning' },
          { tool: 'other', text: 'unrelated', type: 'info' },
        ]}
      />
    )
    expect(screen.getByText('Found 3 results')).toBeInTheDocument()
    expect(screen.getByText('Slow response')).toBeInTheDocument()
    expect(screen.queryByText('unrelated')).toBeNull()
  })

  it('shows "Analysis complete" once isLoading flips false', () => {
    const stages = [{ tool: 't1', label: 'Done step', status: 'done' as const }]
    const { rerender } = render(
      <AgentProgressPanel isLoading={true} stages={stages} messages={[]} />
    )
    rerender(
      <AgentProgressPanel isLoading={false} stages={stages} messages={[]} />
    )
    expect(screen.getByText(/Analysis complete/)).toBeInTheDocument()
  })

  it('hides itself after fade-out timers complete', () => {
    jest.useFakeTimers()
    try {
      const stages = [{ tool: 't1', label: 'x', status: 'done' as const }]
      const { rerender, container } = render(
        <AgentProgressPanel isLoading={true} stages={stages} messages={[]} />
      )
      rerender(
        <AgentProgressPanel isLoading={false} stages={stages} messages={[]} />
      )
      act(() => jest.advanceTimersByTime(700))
      expect(container.firstChild).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })
})
