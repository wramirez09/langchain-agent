import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ManageBillingButton from '../ManageBillingButton'

describe('ManageBillingButton', () => {
  let hrefValue = ''
  beforeAll(() => {
    delete (window as any).location
    ;(window as any).location = {
      get href() {
        return hrefValue
      },
      set href(v: string) {
        hrefValue = v
      },
    }
  })
  beforeEach(() => {
    hrefValue = ''
    ;(global.fetch as any) = jest.fn()
  })

  it('redirects to portal URL on success', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://portal/x' }),
    })
    render(<ManageBillingButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(hrefValue).toBe('https://portal/x'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/stripe/billing',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('alerts on error response', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'no' }),
    })
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})
    render(<ManageBillingButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Unable to open billing portal.'),
    )
    alertSpy.mockRestore()
  })
})
