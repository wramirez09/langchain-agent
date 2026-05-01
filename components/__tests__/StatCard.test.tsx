import { render, screen } from '@testing-library/react'
import { StatCard } from '../admin/StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Users" value="42" />)
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders sub-text when provided', () => {
    render(<StatCard label="x" value="1" sub="last 30d" />)
    expect(screen.getByText('last 30d')).toBeInTheDocument()
  })

  it.each(['default', 'green', 'blue', 'amber', 'red'] as const)(
    'applies %s color class',
    (color) => {
      const { container } = render(
        <StatCard label="x" value="1" color={color} />
      )
      const div = container.querySelector('div')!
      expect(div.className).toMatch(/bg-/)
    }
  )
})
