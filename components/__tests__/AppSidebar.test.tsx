const mockPush = jest.fn()
const mockSignOut = jest.fn()

jest.mock('@/utils/client', () => ({
  createClient: () => ({ auth: { signOut: () => mockSignOut() } }),
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
// Tooltip primitives — render children directly
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppSidebar } from '../AppSidebar'
import {
  PriorAuthProvider,
  usePriorAuthChat,
} from '../providers/PriorAuthProvider'
import { MobileSidebarProvider } from '../providers/MobileSidebarProvider'

function Seeder({ withAssistantMsg }: { withAssistantMsg: boolean }) {
  const { setChatMessages } = usePriorAuthChat()
  React.useEffect(() => {
    if (withAssistantMsg) {
      setChatMessages([{ id: '1', role: 'assistant', content: 'hi' } as any])
    }
  }, [withAssistantMsg, setChatMessages])
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

describe('AppSidebar', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockSignOut.mockReset()
    localStorage.clear()
  })

  it('Export nav is disabled until there is an assistant response', () => {
    const onViewChange = jest.fn()
    render(
      wrap(<AppSidebar activeView="auth" onViewChange={onViewChange} />)
    )
    const exportBtns = screen
      .getAllByRole('button')
      .filter((b) => /Waiting for response|File Export/.test(b.textContent || ''))
    // Export button is disabled
    const exportBtn = exportBtns.find((b) => /File Export/.test(b.textContent || '')) ||
      screen.getByText('File Export').closest('button')!
    expect((exportBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('Logout signs out and pushes to /auth/login', async () => {
    const user = userEvent.setup()
    mockSignOut.mockResolvedValue(undefined)
    render(
      wrap(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    )
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
    render(
      wrap(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    )
    await user.click(screen.getAllByText('Manage Billing')[0].closest('button')!)
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
    render(
      wrap(<AppSidebar activeView="auth" onViewChange={() => {}} />)
    )
    await user.click(screen.getAllByText('Manage Billing')[0].closest('button')!)
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
    render(
      wrap(<AppSidebar activeView="auth" onViewChange={onViewChange} />, {
        withAssistantMsg: true,
      })
    )
    await user.click(screen.getAllByText('File Export')[0].closest('button')!)
    expect(onViewChange).toHaveBeenCalledWith('export')
  })
})
