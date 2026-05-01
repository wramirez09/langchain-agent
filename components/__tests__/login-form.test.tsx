const mockPush = jest.fn()
const mockSignIn = jest.fn()

jest.mock('@/utils/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword: (args: any) => mockSignIn(args) },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../login-form'

describe('LoginForm', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockSignIn.mockReset()
  })

  it('signs in and redirects on success', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({ error: null })
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^password$/i), 'pw')
    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' })
    )
    expect(mockPush).toHaveBeenCalledWith('/protected/preAuth')
  })

  it('shows the error message when sign-in fails', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({ error: new Error('Bad credentials') })
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^password$/i), 'pw')
    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    expect(await screen.findByText('Bad credentials')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders the forgot-password and sign-up links', () => {
    render(<LoginForm />)
    expect(screen.getByText(/Forgot password/i)).toHaveAttribute(
      'href',
      '/auth/forgot-password'
    )
    expect(screen.getByText(/Sign up/i)).toHaveAttribute('href', '/auth/sign-up')
  })
})
