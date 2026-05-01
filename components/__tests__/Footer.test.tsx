import { render, screen } from '@testing-library/react'

const mockUsePathname = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { Footer } from '../Footer'

describe('Footer', () => {
  it('renders on public route', () => {
    mockUsePathname.mockReturnValue('/')
    render(<Footer />)
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument()
    expect(screen.getByText('Terms of Service')).toBeInTheDocument()
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
  })

  it('hides on /agents route', () => {
    mockUsePathname.mockReturnValue('/agents')
    const { container } = render(<Footer />)
    expect(container.firstChild).toBeNull()
  })

  it('hides on /protected route', () => {
    mockUsePathname.mockReturnValue('/protected/x')
    const { container } = render(<Footer />)
    expect(container.firstChild).toBeNull()
  })
})
