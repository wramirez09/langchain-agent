import { render, screen } from '@testing-library/react'
import { Label } from '../label'

describe('Label', () => {
  it('renders text', () => {
    render(<Label>Email</Label>)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('binds to associated input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email-field">Email</Label>
        <input id="email-field" />
      </>
    )
    const label = screen.getByText('Email')
    expect(label).toHaveAttribute('for', 'email-field')
  })
})
