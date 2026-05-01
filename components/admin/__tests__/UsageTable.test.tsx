import { render, screen } from '@testing-library/react'
import { UsageTable } from '../UsageTable'

describe('UsageTable', () => {
  it('shows "no meters configured" message when no rows and no meters', () => {
    render(<UsageTable rows={[]} meters={[]} />)
    expect(screen.getByText(/No usage data found/)).toBeInTheDocument()
    expect(screen.getByText(/No billing meters configured/)).toBeInTheDocument()
  })

  it('shows count of meters when rows empty but meters exist', () => {
    render(<UsageTable rows={[]} meters={[{} as any, {} as any]} />)
    expect(screen.getByText(/2 meter\(s\) found/)).toBeInTheDocument()
  })

  it('renders rows with formatted usage and dates', () => {
    render(
      <UsageTable
        rows={[
          {
            customerId: 'cus_1',
            customerEmail: 'a@b',
            meterId: 'm1',
            meterName: 'preauth',
            totalUsage: 1234,
            startTime: 1700000000,
            endTime: 1702000000,
          },
        ]}
        meters={[]}
      />,
    )
    expect(screen.getByText('a@b')).toBeInTheDocument()
    expect(screen.getByText('preauth')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })
})
