import { render, screen } from '@testing-library/react'
import { CustomerTable } from '../CustomerTable'

const customer = (overrides: any = {}) => ({
  id: 'cus_1',
  name: 'Alice',
  email: 'alice@example.com',
  balance: 0,
  delinquent: false,
  created: 1700000000,
  ...overrides,
})

const sub = (customerId: string, status: string) => ({
  id: 'sub_1',
  customer: customerId,
  status,
})

describe('CustomerTable', () => {
  it('shows empty state when no customers', () => {
    render(<CustomerTable customers={[]} subscriptions={[]} />)
    expect(screen.getByText(/No customers found/)).toBeInTheDocument()
  })

  it('renders customer details', () => {
    render(
      <CustomerTable
        customers={[customer({ balance: 1234, delinquent: true })] as any}
        subscriptions={[sub('cus_1', 'active')] as any}
      />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('$12.34')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('cus_1')).toBeInTheDocument()
  })

  it('shows "none" when no subscription', () => {
    render(
      <CustomerTable
        customers={[customer()] as any}
        subscriptions={[] as any}
      />
    )
    expect(screen.getByText('none')).toBeInTheDocument()
  })

  it('falls back to dashes for missing name/email and zero balance', () => {
    render(
      <CustomerTable
        customers={[customer({ name: null, email: null })] as any}
        subscriptions={[] as any}
      />
    )
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })
})
