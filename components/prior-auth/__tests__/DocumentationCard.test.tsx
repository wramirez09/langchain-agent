import { render, screen, fireEvent } from '@testing-library/react'
import { PriorAuthProvider } from '@/components/providers/PriorAuthProvider'
import { DocumentationCard } from '@/components/prior-auth/artifact/ArtifactSections'

const groups = [
  {
    title: 'Prior Imaging',
    items: [
      { item: 'Knee X-ray report' },
      { item: 'Prior MRI report', provided: true },
    ],
  },
]

describe('DocumentationCard', () => {
  it('persists checkbox toggles in the provider when messageId is set', () => {
    const { unmount } = render(
      <PriorAuthProvider>
        <DocumentationCard groups={groups} messageId="msg-1" />
      </PriorAuthProvider>
    )
    const [xray, mri] = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(xray.checked).toBe(false)
    expect(mri.checked).toBe(true)

    fireEvent.click(xray)
    expect(xray.checked).toBe(true)

    // The override can also flip an agent-checked item off.
    fireEvent.click(mri)
    expect(mri.checked).toBe(false)
    unmount()
  })

  it('falls back to uncontrolled checkboxes outside the provider', () => {
    render(<DocumentationCard groups={groups} messageId="msg-1" />)
    const [xray] = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(xray.checked).toBe(false)
    fireEvent.click(xray)
    expect(xray.checked).toBe(true) // still toggles, just not persisted
  })
})
