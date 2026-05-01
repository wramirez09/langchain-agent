import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '../input'

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input placeholder="email" />)
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument()
  })

  it('forwards typed value via onChange', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Input onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'hi')
    expect(onChange).toHaveBeenCalled()
  })

  it('respects disabled', () => {
    render(<Input disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('merges custom className', () => {
    render(<Input data-testid="i" className="my-input" />)
    expect(screen.getByTestId('i').className).toMatch(/my-input/)
  })
})
