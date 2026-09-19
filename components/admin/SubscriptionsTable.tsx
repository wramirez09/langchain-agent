import type Stripe from 'stripe'

interface Props {
  subscriptions: Stripe.Subscription[]
  customers: Stripe.Customer[]
}

const statusBadge: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trialing: 'bg-primary/10 text-blue-700',
  past_due: 'bg-warning/10 text-warning',
  canceled: 'bg-muted text-foreground-soft',
  unpaid: 'bg-destructive/10 text-destructive',
  incomplete: 'bg-warning/10 text-warning',
  incomplete_expired: 'bg-muted text-faint',
  paused: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
}

function customerEmail(customerId: string, customers: Stripe.Customer[]) {
  return customers.find(c => c.id === customerId)?.email ?? customerId
}

export function SubscriptionsTable({ subscriptions, customers }: Props) {
  if (!subscriptions.length) {
    return <p className="text-sm text-faint py-6 text-center">No subscriptions found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Start Date</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Billing Anchor</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cancel At</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Trial End</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Items</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Collection</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Sub ID</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map(s => {
            const items = s.items.data
            return (
              <tr key={s.id} className="border-b border-border hover:bg-accent transition-colors">
                <td className="py-3 px-4 text-foreground-soft">{customerEmail(s.customer as string, customers)}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge[s.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-muted-foreground">{new Date(s.start_date * 1000).toLocaleDateString()}</td>
                <td className="py-3 px-4 text-muted-foreground">{new Date(s.billing_cycle_anchor * 1000).toLocaleDateString()}</td>
                <td className="py-3 px-4 text-muted-foreground">
                  {s.cancel_at ? new Date(s.cancel_at * 1000).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 px-4 text-muted-foreground">
                  {s.trial_end ? new Date(s.trial_end * 1000).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 px-4 text-foreground-soft text-xs">
                  {items.map(item => (
                    <div key={item.id}>
                      {item.price.nickname ?? item.price.id} — ${((item.price.unit_amount ?? 0) / 100).toFixed(2)}/{item.price.recurring?.interval ?? 'one-time'}
                    </div>
                  ))}
                </td>
                <td className="py-3 px-4 text-muted-foreground capitalize">{s.collection_method.replace('_', ' ')}</td>
                <td className="py-3 px-4 text-faint font-mono text-xs">{s.id}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
