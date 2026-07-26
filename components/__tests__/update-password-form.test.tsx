const mockPush = jest.fn()
const mockGet = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGet }),
}))

const getSession = jest.fn()
const updateUser = jest.fn()
jest.mock('@/utils/client', () => ({
  createClient: () => ({ auth: { getSession: (...a: any[]) => getSession(...a), updateUser: (...a: any[]) => updateUser(...a) } }),
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdatePasswordForm } from '../update-password-form'

// Returns query params per key so email/session_id can differ in one render.
function params(map: Record<string, string | null>) {
  mockGet.mockImplementation((k: string) => (k in map ? map[k] : null))
}

describe('UpdatePasswordForm', () => {
  let originalFetch: any

  beforeEach(() => {
    mockPush.mockReset()
    mockGet.mockReset()
    getSession.mockReset()
    updateUser.mockReset()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('checkout-setup mode (no session)', () => {
    beforeEach(() => getSession.mockResolvedValue({ data: { session: null } }))

    it('shows error if email is missing', async () => {
      params({ email: null, session_id: 'cs_1' })
      const user = userEvent.setup()
      render(<UpdatePasswordForm />)
      await screen.findByRole('button', { name: /Finish Setup/i })
      await user.type(screen.getByPlaceholderText(/Create a secure password/), 'pw')
      await user.click(screen.getByRole('button', { name: /Finish Setup/i }))
      expect(await screen.findByText(/Email is missing/)).toBeInTheDocument()
    })

    it('submits email, password and session_id to API, then redirects', async () => {
      params({ email: 'A@B.com', session_id: 'cs_123' })
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect: '/protected/somewhere' }),
      }) as any
      const user = userEvent.setup()
      render(<UpdatePasswordForm />)
      await screen.findByRole('button', { name: /Finish Setup/i })

      await user.type(screen.getByPlaceholderText(/Create a secure password/), 'pw')
      await user.click(screen.getByRole('button', { name: /Finish Setup/i }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/stripe/setup-password',
          expect.objectContaining({
            body: JSON.stringify({ email: 'a@b.com', password: 'pw', session_id: 'cs_123' }),
          })
        )
      )
      expect(mockPush).toHaveBeenCalledWith('/protected/somewhere')
    })

    it('shows API error', async () => {
      params({ email: 'a@b.com', session_id: 'cs_1' })
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'bad password' }),
      }) as any
      const user = userEvent.setup()
      render(<UpdatePasswordForm />)
      await screen.findByRole('button', { name: /Finish Setup/i })
      await user.type(screen.getByPlaceholderText(/Create a secure password/), 'pw')
      await user.click(screen.getByRole('button', { name: /Finish Setup/i }))
      expect(await screen.findByText('bad password')).toBeInTheDocument()
    })
  })

  describe('recovery mode (session present)', () => {
    beforeEach(() => getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }))

    it('updates the password via the recovery session and redirects to /agents', async () => {
      params({ email: null, session_id: null })
      updateUser.mockResolvedValue({ error: null })
      const user = userEvent.setup()
      render(<UpdatePasswordForm />)

      // Recovery mode hides the email field and relabels the action.
      const button = await screen.findByRole('button', { name: /Update Password/i })
      expect(screen.queryByPlaceholderText(/Enter your email/)).not.toBeInTheDocument()

      await user.type(screen.getByPlaceholderText(/Create a secure password/), 'newpw')
      await user.click(button)

      await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newpw' }))
      expect(global.fetch).toBeUndefined
      expect(mockPush).toHaveBeenCalledWith('/agents')
    })

    it('surfaces an updateUser error', async () => {
      params({ email: null, session_id: null })
      updateUser.mockResolvedValue({ error: { message: 'weak password' } })
      const user = userEvent.setup()
      render(<UpdatePasswordForm />)
      const button = await screen.findByRole('button', { name: /Update Password/i })
      await user.type(screen.getByPlaceholderText(/Create a secure password/), 'x')
      await user.click(button)
      expect(await screen.findByText('weak password')).toBeInTheDocument()
      expect(mockPush).not.toHaveBeenCalled()
    })
  })
})
