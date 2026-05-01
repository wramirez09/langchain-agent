import { render, screen } from '@testing-library/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../card'

describe('Card primitives', () => {
  it('renders all parts and merges custom classes', () => {
    render(
      <Card data-testid="card" className="my-card">
        <CardHeader className="my-header">
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Desc')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/my-card/)
    expect(card.className).toMatch(/rounded-xl/)
  })

  it('forwards ref on Card', () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<Card ref={ref}>x</Card>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})
