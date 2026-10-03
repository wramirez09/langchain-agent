import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorAuthTabs } from '../PriorAuthTabs'
import { PriorAuthProvider } from '../../providers/PriorAuthProvider'

const wrap = (ui: React.ReactNode) => (
  <PriorAuthProvider>{ui}</PriorAuthProvider>
)

describe('PriorAuthTabs', () => {
  it('renders the desktop Request and Report tabs', () => {
    render(wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />))
    // Request and Report each exist twice: the phone/tablet tab and the desktop tab.
    expect(screen.getAllByRole('button', { name: 'Request' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Report' })).toHaveLength(2)
  })

  it('Report button switches the active tab', async () => {
    const user = userEvent.setup()
    render(wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />))
    const outputBtns = screen.getAllByRole('button', { name: 'Report' })
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

  it('shows the phone/tablet tabs (Request, Ai Assistant, Report)', async () => {
    const user = userEvent.setup()
    render(
      wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />)
    )
    const assistant = screen.getByRole('button', { name: 'Ai Assistant' })
    await user.click(assistant)
    expect(assistant.className).toMatch(/border-blue-600/)
  })

  // jsdom applies no CSS, so check the classes that do the hiding: each label
  // must render as exactly one phone/tablet tab and one desktop tab, never two
  // visible at the same width.
  it('shows only one set of tabs at each size', () => {
    render(wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />))
    for (const name of ['Request', 'Report']) {
      const [phone, desktop] = screen.getAllByRole('button', { name })
      expect(phone.className.split(' ')).toContain('md:hidden')
      expect(desktop.className.split(' ')).toContain('hidden')
      expect(desktop.className.split(' ')).toContain('md:flex')
      expect(desktop.className.split(' ')).not.toContain('flex')
    }
  })

  it('keeps Saved named for screen readers when its label is hidden', () => {
    render(wrap(<PriorAuthTabs isLayoutSwapped={false} setIsLayoutSwapped={() => {}} />))
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })
})
