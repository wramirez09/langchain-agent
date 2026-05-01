import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscribeButton } from '../SubscribeButton'

describe('SubscribeButton', () => {
  it('renders default Subscribe label', () => {
    render(<SubscribeButton email="a@b.com" name="Alice" disabled={false} />)
    expect(
      screen.getByRole('button', { name: /Subscribe/i })
    ).not.toBeDisabled()
  })

  it('respects disabled', () => {
    render(<SubscribeButton email="" name="" disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
