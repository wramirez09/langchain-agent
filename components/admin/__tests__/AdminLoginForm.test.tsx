const pushMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminLoginForm } from '../AdminLoginForm'

describe('AdminLoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as any) = jest.fn()
  })

  it('redirects to dashboard on successful login', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    render(<AdminLoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/dashboard'))
  })

  it('shows error message on failed login', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'bad' }),
    })
    render(<AdminLoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }))
    await waitFor(() => expect(screen.getByText('bad')).toBeInTheDocument())
  })
})
