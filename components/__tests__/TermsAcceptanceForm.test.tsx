jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}))
jest.mock('../LegalDocumentModal', () => ({
  LegalDocumentModal: ({
    isOpen,
    title,
    accepted,
    onAcceptedChange,
    checkboxId,
  }: any) =>
    isOpen ? (
      <div data-testid={`modal-${title}`}>
        <input
          type="checkbox"
          id={checkboxId}
          checked={accepted}
          onChange={(e) => onAcceptedChange?.(e.target.checked)}
        />
      </div>
    ) : null,
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TermsAcceptanceForm } from '../TermsAcceptanceForm'
import { toast } from 'sonner'

describe('TermsAcceptanceForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as any) = jest.fn()
  })

  it('disables continue until all three boxes accepted', () => {
    render(<TermsAcceptanceForm email="a@b" name="A" onAccepted={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /Continue to Payment/ })
    expect(btn).toBeDisabled()
  })

  it('checkbox lives inside the modal, not the form', () => {
    render(<TermsAcceptanceForm email="a@b" name="A" onAccepted={jest.fn()} />)
    // Modals are closed initially, so no acceptance checkbox is rendered yet.
    expect(document.getElementById('terms-agreement')).toBeNull()
  })

  it('calls onAccepted on success', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
    const onAccepted = jest.fn()
    render(<TermsAcceptanceForm email="a@b" name="A" onAccepted={onAccepted} />)

    // Open each modal and check its in-modal acceptance box
    fireEvent.click(screen.getByText('Terms of Service', { selector: 'p' }))
    fireEvent.click(document.getElementById('terms-agreement')!)
    fireEvent.click(screen.getByText('Privacy Policy', { selector: 'p' }))
    fireEvent.click(document.getElementById('privacy-agreement')!)
    fireEvent.click(screen.getByText('AI Subscription Agreement', { selector: 'p' }))
    fireEvent.click(document.getElementById('ai-agreement')!)

    fireEvent.click(screen.getByRole('button', { name: /Continue to Payment/ }))

    await waitFor(() => expect(onAccepted).toHaveBeenCalled())
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/accept-terms',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('toasts error when api responds with !ok', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope' }),
    })
    render(<TermsAcceptanceForm email="a@b" name="A" onAccepted={jest.fn()} />)
    fireEvent.click(screen.getByText('Terms of Service', { selector: 'p' }))
    fireEvent.click(document.getElementById('terms-agreement')!)
    fireEvent.click(screen.getByText('Privacy Policy', { selector: 'p' }))
    fireEvent.click(document.getElementById('privacy-agreement')!)
    fireEvent.click(screen.getByText('AI Subscription Agreement', { selector: 'p' }))
    fireEvent.click(document.getElementById('ai-agreement')!)
    fireEvent.click(screen.getByRole('button', { name: /Continue to Payment/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'))
  })
})
