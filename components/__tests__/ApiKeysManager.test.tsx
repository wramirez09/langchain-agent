import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApiKeysManager from '../ApiKeysManager'

// Radix Popover positions via Floating UI, which needs ResizeObserver — jsdom
// has none. Additive polyfill so the row action menu can open in tests.
if (typeof (global as any).ResizeObserver === 'undefined') {
  ;(global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const DAY = 86_400_000

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

/** An active key, used everywhere the list needs a row to act on. */
const activeKey = {
  ...newKeyRow,
  id: 'k-active',
  name: 'Billing reader',
  key_prefix: 'sk_live_aaaa',
  scopes: ['chat'],
  last_used_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
}

type Routes = {
  keys?: unknown[]
  role?: string
  apiAccess?: boolean
  post?: { ok: boolean; status?: number; body: unknown }
  patch?: { ok: boolean; status?: number; body?: unknown }
  del?: { ok: boolean; status?: number; body?: unknown }
}

/** Route-table fetch mock — each test declares only what it cares about. */
function mockFetch(r: Routes = {}) {
  const fn = jest.fn((url: string, opts?: RequestInit) => {
    const method = opts?.method ?? 'GET'
    if (url === '/api/keys' && method === 'GET')
      return Promise.resolve({ ok: true, json: async () => ({ keys: r.keys ?? [] }) })
    if (url === '/api/org' && method === 'GET')
      return Promise.resolve({
        ok: true,
        json: async () => ({ role: r.role ?? 'owner', apiAccess: r.apiAccess !== false }),
      })
    if (url === '/api/keys' && method === 'POST') {
      const p = r.post ?? {
        ok: true,
        status: 201,
        body: { key: 'sk_live_PLAINTEXT_ONCE', apiKey: newKeyRow },
      }
      return Promise.resolve({ ok: p.ok, status: p.status ?? 201, json: async () => p.body })
    }
    if (url.startsWith('/api/keys/') && method === 'PATCH') {
      const p = r.patch ?? { ok: true, body: { success: true } }
      return Promise.resolve({ ok: p.ok, status: p.status ?? 200, json: async () => p.body ?? {} })
    }
    if (url.startsWith('/api/keys/') && method === 'DELETE') {
      const p = r.del ?? { ok: true, body: { success: true } }
      return Promise.resolve({ ok: p.ok, status: p.status ?? 200, json: async () => p.body ?? {} })
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
  })
  global.fetch = fn as unknown as typeof fetch
  return fn
}

const writeText = jest.fn().mockResolvedValue(undefined)

beforeEach(() => writeText.mockClear())

/**
 * userEvent.setup() installs its own navigator.clipboard stub, so ours has to
 * land after it — and jsdom's property is getter-only, hence defineProperty.
 */
function setupUser() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
  return user
}

/** Open a row's ⋮ menu and return it, so item queries can be scoped to it. */
async function openRowMenu(user: ReturnType<typeof userEvent.setup>, keyName: string) {
  await user.click(screen.getByRole('button', { name: `Actions for ${keyName}` }))
  return screen.findByRole('dialog')
}

/** The inline create panel, for scoping queries that collide with list rows. */
const createPanel = () =>
  screen.getByText('Create API key').closest('div.overflow-hidden') as HTMLElement

describe('ApiKeysManager — create', () => {
  it('adds the newly created key to the list without a refetch', async () => {
    const fn = mockFetch()
    const user = setupUser()
    render(<ApiKeysManager />)

    // Empty state after initial load.
    await screen.findByText('No API keys yet')

    // The create form is inline, above the list. A name is required.
    await user.type(screen.getByLabelText('Name'), 'Prod server')
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    // Reveal panel shows the plaintext exactly once.
    await screen.findByText('sk_live_PLAINTEXT_ONCE')

    // Done is gated on confirming the secret was stored.
    const done = screen.getByRole('button', { name: 'Done' })
    expect(done).toBeDisabled()
    await user.click(screen.getByLabelText("I've stored this key in a safe place"))
    await user.click(done)
    await waitFor(() => expect(screen.getByText('Prod server')).toBeInTheDocument())

    // POST fired once; GET /api/keys was NOT re-fetched after create (only the
    // initial mount load), proving the list updated from local state.
    const keysGets = fn.mock.calls.filter(
      ([u, o]) => u === '/api/keys' && (o?.method ?? 'GET') === 'GET',
    )
    expect(keysGets).toHaveLength(1)
  })

  // The secret is unrecoverable, so the copy affordance must hand over the
  // exact plaintext — not the masked prefix shown in the list.
  it('copies the full plaintext secret from the reveal panel', async () => {
    mockFetch()
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')

    await user.type(screen.getByLabelText('Name'), 'Prod server')
    await user.click(screen.getByRole('button', { name: 'Create key' }))
    await screen.findByText('sk_live_PLAINTEXT_ONCE')

    await user.click(screen.getByRole('button', { name: 'Copy secret key' }))
    expect(writeText).toHaveBeenCalledWith('sk_live_PLAINTEXT_ONCE')
  })

  it('requires a name before the key can be created', async () => {
    const fn = mockFetch()
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')

    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled()
    await user.type(screen.getByLabelText('Name'), 'Prod server')
    expect(screen.getByRole('button', { name: 'Create key' })).toBeEnabled()

    expect(fn.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0)
  })

  // Every scope deselected would mint a key that can call nothing, and the API
  // rejects it — block it in the form and say why.
  it('blocks creation when every scope is deselected', async () => {
    mockFetch()
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')
    await user.type(screen.getByLabelText('Name'), 'Prod server')

    await user.click(within(createPanel()).getByRole('button', { name: 'agents' }))
    await user.click(within(createPanel()).getByRole('button', { name: 'chat' }))

    expect(await screen.findByText('Select at least one scope.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled()
  })

  it('sends the chosen environment and scopes', async () => {
    const fn = mockFetch()
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')

    await user.type(screen.getByLabelText('Name'), 'Sandbox tests')
    await user.click(within(createPanel()).getByRole('button', { name: 'test' }))
    await user.click(within(createPanel()).getByRole('button', { name: 'agents' })) // drop agents
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    await waitFor(() => {
      const post = fn.mock.calls.find(([, o]) => o?.method === 'POST')
      expect(JSON.parse(post![1]!.body as string)).toEqual({
        name: 'Sandbox tests',
        environment: 'test',
        scopes: ['chat'],
      })
    })
  })

  // Test mode must not read as "fake data" — it's the same stack, unmetered.
  it('explains what test mode changes when it is selected', async () => {
    mockFetch()
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')

    expect(screen.getByText(/metered and billed/i)).toBeInTheDocument()
    await user.click(within(createPanel()).getByRole('button', { name: 'test' }))
    expect(screen.getByText(/never billed/i)).toBeInTheDocument()
  })

  it('surfaces a failed create inline and keeps the form open', async () => {
    mockFetch({
      post: { ok: false, status: 402, body: { error: 'An active subscription is required.' } },
    })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')

    await user.type(screen.getByLabelText('Name'), 'Prod server')
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An active subscription is required.',
    )
    // Still the create form — no secret panel, nothing to copy.
    expect(screen.getByRole('button', { name: 'Create key' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  })
})

describe('ApiKeysManager — revoke and delete', () => {
  // Revoking is destructive and used to fire on a bare window.confirm; it must
  // now go through the dialog, and must not fire until the dialog is confirmed.
  it('revokes only after the confirmation dialog is confirmed', async () => {
    const fn = mockFetch({ keys: [activeKey] })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    const menu = await openRowMenu(user, 'Billing reader')
    await user.click(within(menu).getByRole('button', { name: 'Revoke key' }))

    // Dialog is up, but nothing has been sent yet.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Revoke this key?')).toBeInTheDocument()
    expect(fn.mock.calls.filter(([, o]) => o?.method === 'PATCH')).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(fn).toHaveBeenCalledWith('/api/keys/k-active', { method: 'PATCH' }))
    // Row stays listed, now marked revoked.
    expect(await screen.findByText('revoked')).toBeInTheDocument()
  })

  it('sends nothing when the revoke dialog is dismissed', async () => {
    const fn = mockFetch({ keys: [activeKey] })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    const menu = await openRowMenu(user, 'Billing reader')
    await user.click(within(menu).getByRole('button', { name: 'Revoke key' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Keep key' }))

    expect(fn.mock.calls.filter(([, o]) => o?.method === 'PATCH')).toHaveLength(0)
    expect(screen.queryByText('revoked')).not.toBeInTheDocument()
  })

  // The optimistic update must roll back, or the UI claims a revocation that
  // never happened while the key keeps working.
  it('restores the row when revoke fails', async () => {
    mockFetch({
      keys: [activeKey],
      patch: { ok: false, status: 500, body: { error: 'Failed to revoke key' } },
    })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    const menu = await openRowMenu(user, 'Billing reader')
    await user.click(within(menu).getByRole('button', { name: 'Revoke key' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }))

    await waitFor(() => expect(screen.getByText('Failed to revoke key')).toBeInTheDocument())
    expect(screen.queryByText('revoked')).not.toBeInTheDocument()
    expect(screen.getByText('1 active')).toBeInTheDocument()
  })

  it('deletes the row after confirmation', async () => {
    const fn = mockFetch({ keys: [activeKey] })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    const menu = await openRowMenu(user, 'Billing reader')
    await user.click(within(menu).getByRole('button', { name: 'Delete key' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete key' }))

    await waitFor(() => expect(fn).toHaveBeenCalledWith('/api/keys/k-active', { method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByText('Billing reader')).not.toBeInTheDocument())
  })

  it('restores the row when delete fails', async () => {
    mockFetch({
      keys: [activeKey],
      del: { ok: false, status: 500, body: { error: 'Failed to delete key' } },
    })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    const menu = await openRowMenu(user, 'Billing reader')
    await user.click(within(menu).getByRole('button', { name: 'Delete key' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete key' }))

    await waitFor(() => expect(screen.getByText('Failed to delete key')).toBeInTheDocument())
    expect(screen.getByText('Billing reader')).toBeInTheDocument()
  })

  // A revoked key can't be revoked twice — the API no-ops, so the menu hides it.
  it('offers no revoke action on an already-revoked key', async () => {
    mockFetch({ keys: [{ ...activeKey, revoked_at: '2026-07-20T00:00:00.000Z' }] })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    const menu = await openRowMenu(user, 'Billing reader')
    expect(within(menu).queryByRole('button', { name: 'Revoke key' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Delete key' })).toBeInTheDocument()
  })
})

describe('ApiKeysManager — list presentation', () => {
  it('copies the masked key id, never a secret', async () => {
    mockFetch({ keys: [activeKey] })
    const user = setupUser()
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    await user.click(screen.getByRole('button', { name: 'Copy key ID for Billing reader' }))
    expect(writeText).toHaveBeenCalledWith('sk_live_aaaa')
  })

  it('counts active and revoked keys separately', async () => {
    mockFetch({
      keys: [
        activeKey,
        { ...activeKey, id: 'k2', name: 'Old key', revoked_at: '2026-07-20T00:00:00.000Z' },
      ],
    })
    render(<ApiKeysManager />)
    expect(await screen.findByText('1 active · 1 revoked')).toBeInTheDocument()
  })

  // Long-idle keys are the ones worth rotating; the hint is the only prompt.
  it('flags a key unused for over 90 days', async () => {
    mockFetch({ keys: [{ ...activeKey, last_used_at: new Date(Date.now() - 120 * DAY).toISOString() }] })
    render(<ApiKeysManager />)
    expect(await screen.findByText('Consider rotating')).toBeInTheDocument()
    expect(screen.getByText('4 months ago')).toBeInTheDocument()
  })

  it('does not nag about rotating a revoked key', async () => {
    mockFetch({
      keys: [
        {
          ...activeKey,
          last_used_at: new Date(Date.now() - 120 * DAY).toISOString(),
          revoked_at: '2026-07-20T00:00:00.000Z',
        },
      ],
    })
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')
    expect(screen.queryByText('Consider rotating')).not.toBeInTheDocument()
  })

  it('reads "Never" for a key that has not been used', async () => {
    mockFetch({ keys: [{ ...activeKey, last_used_at: null }] })
    render(<ApiKeysManager />)
    expect(await screen.findByText('Never')).toBeInTheDocument()
  })
})

describe('ApiKeysManager — permissions', () => {
  // Members can look but not touch: no create form, no per-row actions.
  it('hides create and row actions from members', async () => {
    mockFetch({ keys: [activeKey], role: 'member' })
    render(<ApiKeysManager />)
    await screen.findByText('Billing reader')

    expect(screen.queryByText('Create API key')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actions for Billing reader' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Read-only/)).toBeInTheDocument()
  })

  // Without a subscription the API returns 402, so don't offer the form —
  // point at the fix instead.
  it('replaces the create form with a subscribe prompt when API access is off', async () => {
    mockFetch({ keys: [], apiAccess: false })
    render(<ApiKeysManager />)
    await screen.findByText('No API keys yet')

    expect(screen.getByText(/active subscription is required/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Subscribe' })).toHaveAttribute('href', '/agents/org')
    expect(screen.queryByText('Create API key')).not.toBeInTheDocument()
  })
})
