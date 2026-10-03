const mockGetSession = jest.fn()
const mockFromSelectEqSingle = jest.fn()
const mockOnAuthStateChange = jest.fn()
const mockUnsubscribe = jest.fn()

jest.mock('@/utils/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: any) => {
        mockOnAuthStateChange(cb)
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => mockFromSelectEqSingle() }),
      }),
    }),
  }),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: any) => <img alt={alt} />,
}))
jest.mock('@/public/images/ndLogo.png', () => 'logo.png', { virtual: true })

const mockOpenBillingPortal = jest.fn()
jest.mock('@/lib/billing/openBillingPortal', () => ({
  openBillingPortal: () => mockOpenBillingPortal(),
}))

let mockPathname = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }))
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: jest.fn() }),
}))

const mockToggleIsOpen = jest.fn()
jest.mock('@/components/providers/MobileSidebarProvider', () => ({
  useMobileSidebar: () => ({ toggleIsOpen: mockToggleIsOpen }),
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TopBar from '../TopBar'

describe('TopBar', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockFromSelectEqSingle.mockReset()
    mockToggleIsOpen.mockReset()
  })

  it('renders the logo and wordmark always', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<TopBar />)
    expect(screen.getByAltText('NoteDoctorAiLogo')).toBeInTheDocument()
    expect(screen.getByText('NoteDoctorAi')).toBeInTheDocument()
  })

  it('brand links to the welcome page when signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<TopBar />)
    expect(screen.getByRole('link', { name: 'Go to welcome page' })).toHaveAttribute(
      'href',
      '/'
    )
  })

  it('brand links to home and shows computed initials when logged in', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'will.smith@example.com' } } },
    })
    mockFromSelectEqSingle.mockResolvedValue({
      data: { full_name: 'Will Smith', email: 'will.smith@example.com' },
    })
    render(<TopBar />)
    await waitFor(() => expect(screen.getByText('WS')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute(
      'href',
      '/agents'
    )
  })

  it('hamburger toggles the mobile sidebar', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'a@b.com' } } },
    })
    mockFromSelectEqSingle.mockResolvedValue({ data: null })
    render(<TopBar />)
    const btn = await screen.findByRole('button', { name: /Toggle menu/i })
    const user = userEvent.setup()
    await user.click(btn)
    expect(mockToggleIsOpen).toHaveBeenCalled()
  })

  it('avatar opens the billing portal', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'will.smith@example.com' } } },
    })
    mockFromSelectEqSingle.mockResolvedValue({
      data: { full_name: 'Will Smith', email: 'will.smith@example.com' },
    })
    render(<TopBar />)
    const avatar = await screen.findByRole('button', { name: 'Billing' })
    await userEvent.setup().click(avatar)
    expect(mockOpenBillingPortal).toHaveBeenCalledTimes(1)
  })

  it.each(['/', '/auth/login', '/legal/terms-of-service', '/agents/api-keys'])(
    'shows the theme selector on %s (no side nav there)',
    async (path) => {
      mockPathname = path
      mockGetSession.mockResolvedValue({ data: { session: null } })
      render(<TopBar />)
      expect(screen.getByRole('radiogroup', { name: 'Color theme' })).toBeInTheDocument()
    }
  )

  it.each(['/agents', '/protected/preAuth'])(
    'leaves the theme selector to the side nav on %s',
    async (path) => {
      mockPathname = path
      mockGetSession.mockResolvedValue({ data: { session: null } })
      render(<TopBar />)
      expect(screen.queryByRole('radiogroup', { name: 'Color theme' })).toBeNull()
    }
  )
})
