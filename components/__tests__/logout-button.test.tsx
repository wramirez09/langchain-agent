const mockPush = jest.fn()
const mockSignOut = jest.fn()
const mockGetSession = jest.fn()
const mockOnAuthChange = jest.fn()
const mockFromSelectEqSingle = jest.fn()
const mockUnsubscribe = jest.fn()

jest.mock('@/utils/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => mockGetSession(),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: any) => {
        mockOnAuthChange(cb)
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockFromSelectEqSingle(),
        }),
      }),
    }),
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('../ui/ManageBillingButton', () => ({
  __esModule: true,
  default: () => <span data-testid="manage-billing">Manage</span>,
}))

import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogoutButton } from '../logout-button'

describe('LogoutButton', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockSignOut.mockReset()
    mockGetSession.mockReset()
    mockFromSelectEqSingle.mockReset()
    mockUnsubscribe.mockReset()
    localStorage.clear()
  })

  it('renders nothing when not logged in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const { container } = render(<LogoutButton />)
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('renders user name and signs out', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'a@b.com' } } },
    })
    mockFromSelectEqSingle
      .mockResolvedValueOnce({ data: { full_name: 'Alice' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'active' }, error: null })
    mockSignOut.mockResolvedValue(undefined)

    render(<LogoutButton />)

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.getByTestId('manage-billing')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Logout/i }))
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/auth/login')
  })
})
