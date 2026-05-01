import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorAuthTabs } from '../PriorAuthTabs'
import { PriorAuthProvider } from '../../providers/PriorAuthProvider'

const wrap = (ui: React.ReactNode) => (
  <PriorAuthProvider>{ui}</PriorAuthProvider>
)

describe('PriorAuthTabs', () => {
  it('renders the input tab and at least one output tab', () => {
    render(wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />))
    expect(screen.getByRole('button', { name: 'Input' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Output' }).length).toBeGreaterThan(0)
  })

  it('Output button switches the active tab', async () => {
    const user = userEvent.setup()
    render(wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />))
    const outputBtns = screen.getAllByRole('button', { name: 'Output' })
    // Click the desktop one (last)
    await user.click(outputBtns[outputBtns.length - 1])
    expect(outputBtns[outputBtns.length - 1].className).toMatch(/border-blue-600/)
  })

  it('Swap Layout button toggles layout', async () => {
    const user = userEvent.setup()
    const setSwapped = jest.fn()
    render(
      wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={setSwapped} />)
    )
    await user.click(screen.getByRole('button', { name: /Swap Layout/i }))
    expect(setSwapped).toHaveBeenCalledWith(true)
  })

  it('shows mobile tabs (pre-auth, chat, output)', () => {
    render(
      wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />)
    )
    expect(screen.getByRole('button', { name: 'Pre-Auth' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument()
  })
})
