const mockPush = jest.fn()
const mockGet = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGet }),
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdatePasswordForm } from '../update-password-form'

describe('UpdatePasswordForm', () => {
  let originalFetch: any

  beforeEach(() => {
    mockPush.mockReset()
    mockGet.mockReset()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('shows error if email is missing', async () => {
    mockGet.mockReturnValue(null)
    const user = userEvent.setup()
    render(<UpdatePasswordForm />)
    await user.type(screen.getByPlaceholderText(/Create a secure password/), 'pw')
    await user.click(screen.getByRole('button', { name: /Finish Setup/i }))
    expect(await screen.findByText(/Email is missing/)).toBeInTheDocument()
  })

  it('submits to API and redirects on success', async () => {
    mockGet.mockReturnValue('A@B.com')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirect: '/protected/somewhere' }),
    }) as any
    const user = userEvent.setup()
    render(<UpdatePasswordForm />)

    await user.type(screen.getByPlaceholderText(/Create a secure password/), 'pw')
    await user.click(screen.getByRole('button', { name: /Finish Setup/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/stripe/setup-password',
        expect.objectContaining({
          body: JSON.stringify({ email: 'a@b.com', password: 'pw' }),
        })
      )
    )
    expect(mockPush).toHaveBeenCalledWith('/protected/somewhere')
  })

  it('shows API error', async () => {
    mockGet.mockReturnValue('a@b.com')
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'bad password' }),
    }) as any
    const user = userEvent.setup()
    render(<UpdatePasswordForm />)
    await user.type(screen.getByPlaceholderText(/Create a secure password/), 'pw')
    await user.click(screen.getByRole('button', { name: /Finish Setup/i }))
    expect(await screen.findByText('bad password')).toBeInTheDocument()
  })
})
