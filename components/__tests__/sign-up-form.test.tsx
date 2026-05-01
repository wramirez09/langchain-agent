jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

// Stub the SubscribeButton because it uses window.location & isn't the focus here.
jest.mock('../ui/SubscribeButton', () => ({
  SubscribeButton: ({ disabled }: any) => (
    <button disabled={disabled} aria-label="Subscribe">
      Subscribe
    </button>
  ),
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignUpForm } from '../sign-up-form'

describe('SignUpForm', () => {
  it('renders required fields and link to login', () => {
    render(<SignUpForm />)
    expect(screen.getByLabelText(/Displayed User Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByText('Login')).toHaveAttribute('href', '/auth/login')
  })

  it('Subscribe is disabled until email is entered', async () => {
    const user = userEvent.setup()
    render(<SignUpForm />)
    expect(screen.getByLabelText('Subscribe')).toBeDisabled()
    await user.type(screen.getByLabelText(/Email/i), 'a@b.com')
    expect(screen.getByLabelText('Subscribe')).not.toBeDisabled()
  })
})
