jest.mock('framer-motion', () => ({
  motion: { div: ({ children, ...rest }: any) => <div {...rest}>{children}</div> },
}))
// react-select is heavy; simple stub
jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, isDisabled, placeholder }: any) => (
    <select
      value={value?.value ?? ''}
      disabled={!!isDisabled}
      onChange={(e) =>
        onChange(options.find((o: any) => o.value === e.target.value) ?? null)
      }
      data-placeholder={placeholder}
    >
      <option value="" />
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))
jest.mock('react-select/creatable', () => ({
  __esModule: true,
  default: ({ options, value, onChange }: any) => (
    <select
      multiple
      value={value?.map((v: any) => v.value) ?? []}
      onChange={() => onChange([])}
    >
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))
jest.mock('@/data/ncdOptions', () => ({ ncdOptions: [] }))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorAuthFormPanel } from '../PriorAuthFormPanel'
import { PriorAuthProvider } from '../../providers/PriorAuthProvider'

const wrap = (ui: React.ReactNode) => (
  <PriorAuthProvider>{ui}</PriorAuthProvider>
)

const baseProps = {
  guidelinesOptions: [
    { value: 'Medicare', label: 'Medicare' },
    { value: 'Commercial', label: 'Commercial' },
  ],
  isProcessing: false,
  isLayoutSwapped: false,
  onGenerate: jest.fn(),
  onCancel: jest.fn(),
}

describe('PriorAuthFormPanel', () => {
  beforeEach(() => jest.clearAllMocks())

  it('Generate is disabled until guidelines is selected', () => {
    render(wrap(<PriorAuthFormPanel {...baseProps} />))
    const btn = screen.getByRole('button', { name: /Generate Authorization/i })
    expect(btn).toBeDisabled()
  })

  it('clicking Cancel calls onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = jest.fn()
    render(wrap(<PriorAuthFormPanel {...baseProps} onCancel={onCancel} />))
    await user.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('selecting Commercial enables Generate and shows commercial-state hint', async () => {
    const user = userEvent.setup()
    const onGenerate = jest.fn()
    render(wrap(<PriorAuthFormPanel {...baseProps} onGenerate={onGenerate} />))

    // First select element is "Guidelines"
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'Commercial')

    expect(
      screen.getByText(/State selection not required for Commercial/i)
    ).toBeInTheDocument()

    const btn = screen.getByRole('button', { name: /Generate Authorization/i })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(onGenerate).toHaveBeenCalled()
  })

  it('shows the "Generating…" label when isProcessing', () => {
    render(wrap(<PriorAuthFormPanel {...baseProps} isProcessing={true} />))
    expect(screen.getByText(/Generating…/)).toBeInTheDocument()
  })
})
