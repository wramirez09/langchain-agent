import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntermediateStep } from '../IntermediateStep'

const mkMessage = (content: string) => ({ id: '1', role: 'tool', content }) as any

describe('IntermediateStep', () => {
  it('renders action name from JSON content', () => {
    const json = JSON.stringify({ action: { name: 'search_tool', query: 'mri' }, observation: 'result' })
    render(<IntermediateStep message={mkMessage(json)} />)
    expect(screen.getByText('search_tool')).toBeInTheDocument()
  })

  it('expands to show details on click', async () => {
    const user = userEvent.setup()
    const json = JSON.stringify({
      action: { name: 'tool_x', query: 'foo' },
      observation: 'Hello result',
    })
    render(<IntermediateStep message={mkMessage(json)} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Hello result')).toBeInTheDocument()
    expect(screen.getByText(/Action Details/i)).toBeInTheDocument()
  })

  it('falls back to Step + observation for plain text content', async () => {
    const user = userEvent.setup()
    render(<IntermediateStep message={mkMessage('plain text observation')} />)
    expect(screen.getByText('Step')).toBeInTheDocument()
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('plain text observation')).toBeInTheDocument()
  })

  it('renders nested object observation as JSON', async () => {
    const user = userEvent.setup()
    const json = JSON.stringify({
      action: { name: 'thing' },
      observation: { foo: 'bar' },
    })
    render(<IntermediateStep message={mkMessage(json)} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText(/foo/)).toBeInTheDocument()
    expect(screen.getByText(/bar/)).toBeInTheDocument()
  })

  it('shows "Processing..." for empty content', () => {
    render(<IntermediateStep message={mkMessage('')} />)
    expect(screen.getByText(/Processing\.\.\./)).toBeInTheDocument()
  })

  it('handles malformed JSON gracefully', async () => {
    const user = userEvent.setup()
    render(<IntermediateStep message={mkMessage('{not really json')} />)
    expect(screen.getByText('Step')).toBeInTheDocument()
    await user.click(screen.getByRole('button'))
    expect(screen.getByText(/not really json/)).toBeInTheDocument()
  })
})
