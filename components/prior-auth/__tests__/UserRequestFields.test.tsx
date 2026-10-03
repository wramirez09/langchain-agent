import { render, screen } from '@testing-library/react'
import { UserRequestFields } from '../UserRequestFields'

describe('UserRequestFields', () => {
  it("labels each field with the form's icon, but not free-text notes", () => {
    render(
      <UserRequestFields content="Guidelines: Medicare. State: Arizona. Treatment: Acupuncture | Any priors needed?" />
    )
    const iconClass = (label: string) =>
      screen.getByText(label).querySelector('svg')?.getAttribute('class') ?? ''

    expect(iconClass('Guidelines')).toContain('lucide-file-text')
    expect(iconClass('State')).toContain('lucide-map-pin')
    expect(iconClass('Treatment')).toContain('lucide-stethoscope')
    expect(screen.getByText('Additional Notes').querySelector('svg')).toBeNull()
  })
})
