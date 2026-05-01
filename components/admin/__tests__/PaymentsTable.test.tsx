import { render, screen } from '@testing-library/react'
import { PaymentsTable } from '../PaymentsTable'

const charge = (o: any = {}) => ({
  id: 'ch_1',
  amount: 1500,
  currency: 'usd',
  status: 'succeeded',
  billing_details: { email: 'a@b.com' },
  description: 'Payment for X',
  created: 1700000200,
  receipt_url: 'https://r/1',
  ...o,
})

const invoice = (o: any = {}) => ({
  id: 'in_1',
  amount_paid: 2500,
  currency: 'usd',
  status: 'paid',
  customer_email: 'b@c.com',
  description: 'Invoice for Y',
  billing_reason: null,
  created: 1700000100,
  hosted_invoice_url: 'https://i/1',
  ...o,
})

describe('PaymentsTable', () => {
  it('shows empty state when no rows', () => {
    render(<PaymentsTable charges={[]} invoices={[]} />)
    expect(screen.getByText(/No payments found/)).toBeInTheDocument()
  })

  it('renders charges and invoices sorted by date desc', () => {
    render(
      <PaymentsTable
        charges={[charge()] as any}
        invoices={[invoice()] as any}
      />
    )
    // Charge is newer (200 > 100), should appear first
    const rows = screen.getAllByRole('row')
    // [0] is header, [1] is first row (charge)
    expect(rows[1]).toHaveTextContent('charge')
    expect(rows[2]).toHaveTextContent('invoice')
  })

  it('renders amounts with currency', () => {
    render(
      <PaymentsTable charges={[charge()] as any} invoices={[]} />
    )
    expect(screen.getByText(/\$15\.00 USD/)).toBeInTheDocument()
  })

  it('shows View link when receipt url present', () => {
    render(
      <PaymentsTable charges={[charge()] as any} invoices={[]} />
    )
    const link = screen.getByRole('link', { name: /View/i })
    expect(link).toHaveAttribute('href', 'https://r/1')
  })

  it('shows dash when no url', () => {
    render(
      <PaymentsTable
        charges={[charge({ receipt_url: null })] as any}
        invoices={[]}
      />
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('falls back to billing_reason when description is null on invoice', () => {
    render(
      <PaymentsTable
        charges={[]}
        invoices={[invoice({ description: null, billing_reason: 'subscription_cycle' })] as any}
      />
    )
    expect(screen.getByText('subscription_cycle')).toBeInTheDocument()
  })
})
