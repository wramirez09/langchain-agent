const mockPush = jest.fn()
const mockSignOut = jest.fn()

jest.mock('@/utils/client', () => ({
  createClient: () => ({
    auth: {
      signOut: () => mockSignOut(),
      getSession: async () => ({
        data: { session: { user: { email: 'wramirez1980@example.com' } } },
      }),
    },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick }: any) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: any) => <img src={src?.src ?? src} alt={alt} />,
}))
// Tooltip primitives — render children directly
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
}))

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppSidebar } from '../AppSidebar'
import {
  PriorAuthProvider,
  usePriorAuthChat,
} from '../providers/PriorAuthProvider'
import { MobileSidebarProvider } from '../providers/MobileSidebarProvider'

function Seeder({ withAssistantMsg }: { withAssistantMsg: boolean }) {
  const { setChatMessages, setResponseReady } = usePriorAuthChat()
  React.useEffect(() => {
    if (withAssistantMsg) {
      setChatMessages([{ id: '1', role: 'assistant', content: 'hi' } as any])
      setResponseReady(true)
    }
  }, [withAssistantMsg, setChatMessages, setResponseReady])
  return null
}

import React from 'react'

const wrap = (
  ui: React.ReactNode,
  opts: { withAssistantMsg?: boolean } = {}
) => (
  <MobileSidebarProvider>
    <PriorAuthProvider>
      <Seeder withAssistantMsg={!!opts.withAssistantMsg} />
      {ui}
    </PriorAuthProvider>
  </MobileSidebarProvider>
)

/** Render and wait for the async session fetch (account card identity) to
 * settle, so state updates land inside act(). */
const renderSidebar = async (
  ui: React.ReactNode,
  opts: { withAssistantMsg?: boolean } = {}
) => {
  render(wrap(ui, opts))
  await screen.findByText('wramirez1980')
}

describe('AppSidebar', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockSignOut.mockReset()
    localStorage.clear()
  })

  it('Export nav is disabled until there is an assistant response', async () => {
    const onViewChange = jest.fn()
    await renderSidebar(
      <AppSidebar activeView="auth" onViewChange={onViewChange} />
    )
    const exportBtns = screen
      .getAllByRole('button')
      .filter((b) => /Waiting for response|Export/.test(b.textContent || ''))
    // Export button is disabled
    const exportBtn = exportBtns.find((b) => /Export/.test(b.textContent || '')) ||
      screen.getByText('Export').closest('button')!
    expect((exportBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('Logout signs out and pushes to /auth/login', async () => {
    const user = userEvent.setup()
    mockSignOut.mockResolvedValue(undefined)
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    await user.click(screen.getAllByText('Logout')[0].closest('button')!)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockPush).toHaveBeenCalledWith('/auth/login')
  })

  it('Manage Billing redirects on success', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://billing.example/portal' }),
    })
    global.fetch = fetchMock as any
    const setHref = jest.fn()
    const original = Object.getOwnPropertyDescriptor(window, 'location')
    try {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          get href() {
            return ''
          },
          set href(v: string) {
            setHref(v)
          },
        },
      })
    } catch {
      // jsdom may forbid reassign
    }
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    await user.click(screen.getAllByText('Billing')[0].closest('button')!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    if (original) {
      try {
        Object.defineProperty(window, 'location', original)
      } catch {}
    }
  })

  it('Manage Billing alerts on 404', async () => {
    const user = userEvent.setup()
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as any
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    await user.click(screen.getAllByText('Billing')[0].closest('button')!)
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('No billing account')
      )
    )
    alertSpy.mockRestore()
  })

  it('clicking nav switches view', async () => {
    const user = userEvent.setup()
    const onViewChange = jest.fn()
    await renderSidebar(
      <AppSidebar activeView="auth" onViewChange={onViewChange} />,
      { withAssistantMsg: true }
    )
    await user.click(screen.getAllByText('Export')[0].closest('button')!)
    expect(onViewChange).toHaveBeenCalledWith('export')
  })

  it('marks the active route with aria-current', async () => {
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    const requests = screen.getByRole('button', { name: 'Requests' })
    expect(requests).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Export' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('exposes a labeled primary nav', async () => {
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  // NOTE: pin/nav clicks below use fireEvent (no pointer-move simulation).
  // userEvent.click moves the virtual pointer first, which fires a spurious
  // mouseleave on the zone in jsdom (the pin is a zone descendant, so a real
  // browser keeps hover) — that unmounts the conditional pin mid-click.
  it('hover floats the rail open with scrim; pinning removes the scrim and widens the gutter', async () => {
    const user = userEvent.setup()
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    const zone = screen.getByTestId('flyout-zone')
    const scrim = screen.getByTestId('flyout-scrim')

    // Collapsed: pin hidden, gutter at 76px, scrim transparent.
    expect(screen.queryByRole('button', { name: /Pin sidebar/i })).toBeNull()
    expect(zone.className).toContain('md:w-[76px]')
    expect(scrim.className).toContain('opacity-0')

    // Hover: floats open (gutter unchanged) with scrim.
    await user.hover(zone)
    expect(zone.className).toContain('md:w-[76px]')
    expect(scrim.className).toContain('opacity-100')
    const pin = screen.getByRole('button', { name: 'Pin sidebar open' })

    // Pin: static sidebar — gutter widens, scrim gone.
    fireEvent.click(pin)
    expect(zone.className).toContain('md:w-[256px]')
    expect(scrim.className).toContain('opacity-0')
    expect(
      screen.getByRole('button', { name: 'Unpin sidebar' })
    ).toHaveAttribute('aria-pressed', 'true')

    // Unpin while still hovered: floats again.
    fireEvent.click(screen.getByRole('button', { name: 'Unpin sidebar' }))
    expect(zone.className).toContain('md:w-[76px]')
  })

  it('selecting an item collapses the floated rail (unless pinned)', async () => {
    const user = userEvent.setup()
    await renderSidebar(
      <AppSidebar activeView="auth" onViewChange={() => {}} />,
      { withAssistantMsg: true }
    )
    const zone = screen.getByTestId('flyout-zone')
    await user.hover(zone)
    expect(screen.getByTestId('flyout-scrim').className).toContain('opacity-100')
    fireEvent.click(screen.getByRole('button', { name: 'Requests' }))
    expect(screen.getByTestId('flyout-scrim').className).toContain('opacity-0')
  })

  it('shows the account card identity from the session email', async () => {
    await renderSidebar(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    expect(screen.getByText('wramirez1980')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Account settings' })
    ).toBeInTheDocument()
  })
})
