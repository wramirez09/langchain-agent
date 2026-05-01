import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'

describe('Button', () => {
  it('renders default variant', () => {
    render(<Button>Click me</Button>)
    const btn = screen.getByRole('button', { name: /click me/i })
    expect(btn).toBeInTheDocument()
    expect(btn.className).toMatch(/bg-primary/)
  })

  it.each([
    ['destructive', /bg-destructive/],
    ['outline', /border/],
    ['secondary', /bg-secondary/],
    ['ghost', /hover:bg-accent/],
    ['link', /underline/],
  ] as const)('renders %s variant', (variant, pattern) => {
    render(<Button variant={variant}>x</Button>)
    expect(screen.getByRole('button')).toHaveClass(/.+/)
    expect(screen.getByRole('button').className).toMatch(pattern)
  })

  it.each([
    ['sm', /h-8/],
    ['lg', /h-10/],
    ['icon', /w-9/],
  ] as const)('renders %s size', (size, pattern) => {
    render(<Button size={size}>x</Button>)
    expect(screen.getByRole('button').className).toMatch(pattern)
  })

  it('handles onClick', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>go</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('respects disabled', () => {
    render(<Button disabled>x</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('forwards ref', () => {
    const ref = { current: null as HTMLButtonElement | null }
    render(<Button ref={ref}>x</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('asChild renders the child as the trigger', () => {
    render(
      <Button asChild>
        <a href="/x">link</a>
      </Button>
    )
    const a = screen.getByRole('link', { name: /link/i })
    expect(a).toBeInTheDocument()
    expect(a.className).toMatch(/inline-flex/)
  })
})
