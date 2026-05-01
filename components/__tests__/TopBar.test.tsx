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

  it('renders the logo always', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<TopBar />)
    expect(screen.getByText('NoteDoctor.Ai')).toBeInTheDocument()
  })

  it('shows email + computed initials when logged in', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'will.smith@example.com' } } },
    })
    mockFromSelectEqSingle.mockResolvedValue({
      data: { full_name: 'Will Smith', email: 'will.smith@example.com' },
    })
    render(<TopBar />)
    await waitFor(() =>
      expect(screen.getByText('Will Smith')).toBeInTheDocument()
    )
    expect(screen.getByText('will.smith@example.com')).toBeInTheDocument()
    expect(screen.getByText('WS')).toBeInTheDocument()
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
})
