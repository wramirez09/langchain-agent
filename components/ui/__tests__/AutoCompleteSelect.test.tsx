jest.mock('@/utils/use-media-query', () => ({
  useMediaQuery: jest.fn(),
}))

import { render, screen, fireEvent } from '@testing-library/react'
import AutoCompleteSelect from '../AutoCompleteSelect'
import { useMediaQuery } from '@/utils/use-media-query'

const options = [
  { label: 'Aetna', value: 'aetna' },
  { label: 'Cigna', value: 'cigna' },
] as any

describe('AutoCompleteSelect', () => {
  it('renders the placeholder on desktop', () => {
    ;(useMediaQuery as jest.Mock).mockReturnValue(true)
    render(<AutoCompleteSelect options={options} onChange={jest.fn()} />)
    expect(screen.getByText('Select an option')).toBeInTheDocument()
  })

  it('disabled state disables the trigger button', () => {
    ;(useMediaQuery as jest.Mock).mockReturnValue(true)
    render(
      <AutoCompleteSelect options={options} onChange={jest.fn()} disabled />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('renders mobile drawer trigger when not desktop', () => {
    ;(useMediaQuery as jest.Mock).mockReturnValue(false)
    render(<AutoCompleteSelect options={options} onChange={jest.fn()} />)
    expect(screen.getByText(/Set status/)).toBeInTheDocument()
  })
})
