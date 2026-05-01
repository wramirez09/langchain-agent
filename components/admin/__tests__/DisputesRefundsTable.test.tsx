import { render, screen } from '@testing-library/react'
import { DisputesRefundsTable } from '../DisputesRefundsTable'

describe('DisputesRefundsTable', () => {
  it('shows empty state when no rows', () => {
    render(<DisputesRefundsTable disputes={[]} refunds={[]} />)
    expect(screen.getByText(/No disputes or refunds found/)).toBeInTheDocument()
  })

  it('renders disputes and refunds, sorted by date descending', () => {
    render(
      <DisputesRefundsTable
        disputes={[
          {
            id: 'dp_1',
            amount: 1000,
            currency: 'usd',
            status: 'won',
            reason: 'fraudulent',
            created: 200,
            charge: 'ch_1',
          } as any,
        ]}
        refunds={[
          {
            id: 'rf_1',
            amount: 500,
            currency: 'usd',
            status: 'succeeded',
            reason: 'requested_by_customer',
            created: 100,
            charge: 'ch_2',
          } as any,
        ]}
      />,
    )
    expect(screen.getByText('dispute')).toBeInTheDocument()
    expect(screen.getByText('refund')).toBeInTheDocument()
    expect(screen.getByText('$10.00 USD')).toBeInTheDocument()
    expect(screen.getByText('$5.00 USD')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('dispute')
    expect(rows[1]).toHaveTextContent('refund')
  })
})
