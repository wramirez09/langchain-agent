jest.mock('../ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: any) =>
    open ? (
      <div data-testid="dialog" data-onchange={!!onOpenChange}>
        {children}
        <button data-testid="close-dialog" onClick={() => onOpenChange(false)}>
          x
        </button>
      </div>
    ) : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))

jest.mock('../LegalDocumentViewer', () => ({
  LegalDocumentViewer: ({ content }: any) => <div data-testid="viewer">{content}</div>,
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LegalDocumentModal } from '../LegalDocumentModal'

describe('LegalDocumentModal', () => {
  it('renders title and content when open', () => {
    render(
      <LegalDocumentModal
        isOpen={true}
        onClose={() => {}}
        title="Privacy"
        content="body text"
      />
    )
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByTestId('viewer')).toHaveTextContent('body text')
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <LegalDocumentModal
        isOpen={false}
        onClose={() => {}}
        title="x"
        content="y"
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('Close button calls onClose', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(
      <LegalDocumentModal
        isOpen={true}
        onClose={onClose}
        title="x"
        content="y"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Dialog onOpenChange(false) calls onClose', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(
      <LegalDocumentModal
        isOpen={true}
        onClose={onClose}
        title="x"
        content="y"
      />
    )
    await user.click(screen.getByTestId('close-dialog'))
    expect(onClose).toHaveBeenCalled()
  })
})
