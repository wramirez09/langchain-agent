import { render, screen } from '@testing-library/react'
import { EventsLog } from '../EventsLog'

const evt = (overrides: any = {}) => ({
  id: 'evt_1',
  type: 'customer.subscription.created',
  api_version: '2025-10-29',
  pending_webhooks: 0,
  created: 1700000000,
  ...overrides,
})

describe('EventsLog', () => {
  it('shows empty state', () => {
    render(<EventsLog events={[]} />)
    expect(screen.getByText(/No events found/)).toBeInTheDocument()
  })

  it('renders event rows with type badges', () => {
    render(
      <EventsLog
        events={[
          evt(),
          evt({ id: 'evt_2', type: 'invoice.payment_succeeded' }),
          evt({ id: 'evt_3', type: 'charge.dispute.created' }),
          evt({ id: 'evt_4', type: 'unknown.kind' }),
        ] as any}
      />
    )
    expect(screen.getByText('customer.subscription.created')).toBeInTheDocument()
    expect(screen.getByText('invoice.payment_succeeded')).toBeInTheDocument()
    expect(screen.getByText('charge.dispute.created')).toBeInTheDocument()
    expect(screen.getByText('unknown.kind')).toBeInTheDocument()
  })

  it('falls back to dash when api_version is null', () => {
    render(<EventsLog events={[evt({ api_version: null })] as any} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
