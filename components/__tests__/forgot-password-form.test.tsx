const mockReset = jest.fn()
jest.mock('@/utils/client', () => ({
  createClient: () => ({
    auth: { resetPasswordForEmail: (...args: any[]) => mockReset(...args) },
  }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordForm } from '../forgot-password-form'

describe('ForgotPasswordForm', () => {
  beforeEach(() => mockReset.mockReset())

  it('shows success card after sending reset email', async () => {
    const user = userEvent.setup()
    mockReset.mockResolvedValue({ error: null })
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /Send reset email/i }))

    expect(await screen.findByText(/Check Your Email/i)).toBeInTheDocument()
    expect(mockReset).toHaveBeenCalledWith(
      'a@b.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/update-password') })
    )
  })

  it('surfaces an error message', async () => {
    const user = userEvent.setup()
    mockReset.mockResolvedValue({ error: new Error('No such user') })
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'x@y.com')
    await user.click(screen.getByRole('button', { name: /Send reset email/i }))

    expect(await screen.findByText('No such user')).toBeInTheDocument()
  })

  it('shows loading text while submitting', async () => {
    const user = userEvent.setup()
    let resolve!: (v: any) => void
    mockReset.mockImplementation(
      () => new Promise((r) => (resolve = r))
    )
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /Send reset email/i }))

    expect(screen.getByText(/Sending/)).toBeInTheDocument()
    resolve({ error: null })
  })
})
