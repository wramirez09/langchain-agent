import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from '../password-input'

describe('PasswordInput', () => {
  it('starts masked and toggles visibility from the eye button', async () => {
    const user = userEvent.setup()
    render(<PasswordInput aria-label="Password" />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('does not submit the surrounding form', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Password" />
      </form>
    )
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the toggle with the input', () => {
    render(<PasswordInput aria-label="Password" disabled />)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled()
  })
})
