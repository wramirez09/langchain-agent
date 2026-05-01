import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from '../textarea'

describe('Textarea', () => {
  it('renders a textarea', () => {
    render(<Textarea placeholder="notes" />)
    expect(screen.getByPlaceholderText('notes')).toBeInTheDocument()
  })

  it('forwards onChange', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<Textarea onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'x')
    expect(onChange).toHaveBeenCalled()
  })
})
