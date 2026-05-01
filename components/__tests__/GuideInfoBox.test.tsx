import { render, screen } from '@testing-library/react'
import { GuideInfoBox } from '../guide/GuideInfoBox'

describe('GuideInfoBox', () => {
  it('renders children', () => {
    render(<GuideInfoBox>hello world</GuideInfoBox>)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })
})
