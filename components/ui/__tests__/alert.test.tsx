import { render, screen } from '@testing-library/react'
import { Alert, AlertTitle, AlertDescription } from '../alert'

describe('Alert', () => {
  it('renders with default variant', () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Watch out</AlertDescription>
      </Alert>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('Watch out')).toBeInTheDocument()
  })

  it('renders destructive variant class', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>x</AlertTitle>
      </Alert>
    )
    expect(screen.getByRole('alert').className).toMatch(/destructive/)
  })
})
