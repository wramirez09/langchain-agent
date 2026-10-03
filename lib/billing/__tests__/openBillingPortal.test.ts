/** @jest-environment jsdom */
import { toast } from 'sonner'
import { openBillingPortal } from '../openBillingPortal'

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const respond = (ok: boolean, status: number, body: unknown) =>
  (global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch)

describe('openBillingPortal', () => {
  let tab: { location: { href: string }; close: jest.Mock }
  let openSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    tab = { location: { href: '' }, close: jest.fn() }
    openSpy = jest
      .spyOn(window, 'open')
      .mockReturnValue(tab as unknown as Window)
  })

  afterEach(() => openSpy.mockRestore())

  it('redirects the pre-opened tab to the portal URL', async () => {
    respond(true, 200, { url: 'https://billing.example/portal' })
    await openBillingPortal()
    expect(global.fetch).toHaveBeenCalledWith('/api/stripe/billing', {
      method: 'POST',
    })
    expect(tab.location.href).toBe('https://billing.example/portal')
  })

  it('falls back to a fresh window when the popup was blocked', async () => {
    openSpy.mockReturnValueOnce(null)
    respond(true, 200, { url: 'https://billing.example/portal' })
    await openBillingPortal()
    expect(openSpy).toHaveBeenLastCalledWith(
      'https://billing.example/portal',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('closes the tab when no URL comes back', async () => {
    respond(true, 200, {})
    await openBillingPortal()
    expect(tab.close).toHaveBeenCalled()
  })

  it('asks the user to log in on 401', async () => {
    respond(false, 401, {})
    await openBillingPortal()
    expect(tab.close).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Please log in to access billing.')
  })

  it("surfaces the server's message on other errors", async () => {
    respond(false, 404, { error: 'No Stripe customer' })
    await openBillingPortal()
    expect(toast.error).toHaveBeenCalledWith('No Stripe customer')
  })

  it('uses a generic message when the server gives none', async () => {
    respond(false, 500, {})
    await openBillingPortal()
    expect(toast.error).toHaveBeenCalledWith('Unable to open billing portal.')
  })

  it('reports network failures', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    await openBillingPortal()
    expect(tab.close).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      'Unable to open billing portal. Please try again later.'
    )
  })
})
