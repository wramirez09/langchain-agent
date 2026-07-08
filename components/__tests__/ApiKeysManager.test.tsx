import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApiKeysManager from '../ApiKeysManager'

const newKeyRow = {
  id: 'k-new',
  name: 'Prod server',
  key_prefix: 'sk_live_zzzz',
  environment: 'live',
  scopes: ['agents', 'chat'],
  rate_limit_tier: 'standard',
  created_at: '2026-07-07T00:00:00.000Z',
  last_used_at: null,
  revoked_at: null,
  expires_at: null,
  created_by: 'u1',
  created_by_email: 'me@example.com',
}

/** GET keys (empty) + GET org (owner, api access) + POST create -> returns apiKey. */
function mockFetch() {
  const fn = jest.fn((url: string, opts?: RequestInit) => {
    const method = opts?.method ?? 'GET'
    if (url === '/api/keys' && method === 'GET')
      return Promise.resolve({ ok: true, json: async () => ({ keys: [] }) })
    if (url === '/api/org' && method === 'GET')
      return Promise.resolve({ ok: true, json: async () => ({ role: 'owner', apiAccess: true }) })
    if (url === '/api/keys' && method === 'POST')
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({ key: 'sk_live_PLAINTEXT_ONCE', apiKey: newKeyRow }),
      })
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
  })
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('ApiKeysManager — create updates the list', () => {
  beforeEach(() => {
    mockFetch()
    // jsdom lacks clipboard; the reveal view's copy button uses it.
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
  })

  it('adds the newly created key to the list without a refetch', async () => {
    const user = userEvent.setup()
    render(<ApiKeysManager />)

    // Empty state after initial load.
    await screen.findByText('No API keys yet')

    // Open the create dialog (toolbar button), then submit it.
    await user.click(screen.getByRole('button', { name: 'Create key' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }))

    // Reveal view shows the plaintext exactly once.
    await screen.findByText('sk_live_PLAINTEXT_ONCE')

    // Close the dialog — the new key must now be in the list (optimistic, no refetch).
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.getByText('Prod server')).toBeInTheDocument())

    // POST fired once; GET /api/keys was NOT re-fetched after create (only the
    // initial mount load), proving the list updated from local state.
    const fn = global.fetch as jest.Mock
    const keysGets = fn.mock.calls.filter(
      ([u, o]) => u === '/api/keys' && (o?.method ?? 'GET') === 'GET',
    )
    expect(keysGets).toHaveLength(1)
  })
})
