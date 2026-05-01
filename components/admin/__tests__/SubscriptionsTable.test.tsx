import { render, screen } from '@testing-library/react'
import { SubscriptionsTable } from '../SubscriptionsTable'

const baseSub: any = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  start_date: 1700000000,
  billing_cycle_anchor: 1700000000,
  cancel_at: null,
  trial_end: null,
  collection_method: 'charge_automatically',
  items: {
    data: [
      {
        id: 'si_1',
        price: { id: 'p1', nickname: 'Pro', unit_amount: 2000, recurring: { interval: 'month' } },
      },
    ],
  },
}

describe('SubscriptionsTable', () => {
  it('shows empty state when no subscriptions', () => {
    render(<SubscriptionsTable subscriptions={[]} customers={[]} />)
    expect(screen.getByText(/No subscriptions found/)).toBeInTheDocument()
  })

  it('renders subscription rows with customer email and price', () => {
    render(
      <SubscriptionsTable
        subscriptions={[baseSub]}
        customers={[{ id: 'cus_1', email: 'a@b.com' } as any]}
      />,
    )
    expect(screen.getByText('a@b.com')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText(/Pro — \$20.00\/month/)).toBeInTheDocument()
    expect(screen.getByText('sub_1')).toBeInTheDocument()
  })

  it('falls back to customer ID when customer not found', () => {
    render(<SubscriptionsTable subscriptions={[baseSub]} customers={[]} />)
    expect(screen.getByText('cus_1')).toBeInTheDocument()
  })
})
