import type Stripe from 'stripe'

interface Props {
  customers: Stripe.Customer[]
  subscriptions: Stripe.Subscription[]
}

function subStatus(customerId: string, subscriptions: Stripe.Subscription[]) {
  const sub = subscriptions.find(s => s.customer === customerId)
  return sub?.status ?? 'none'
}

const statusBadge: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trialing: 'bg-primary/10 text-blue-700',
  past_due: 'bg-warning/10 text-warning',
  canceled: 'bg-muted text-foreground-soft',
  unpaid: 'bg-destructive/10 text-destructive',
  none: 'bg-muted text-faint',
}

export function CustomerTable({ customers, subscriptions }: Props) {
  if (!customers.length) {
    return <p className="text-sm text-faint py-6 text-center">No customers found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Subscription</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Balance</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Delinquent</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Created</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer ID</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
            const status = subStatus(c.id, subscriptions)
            return (
              <tr key={c.id} className="border-b border-border hover:bg-accent transition-colors">
                <td className="py-3 px-4 font-medium text-foreground">{c.name ?? '—'}</td>
                <td className="py-3 px-4 text-foreground-soft">{c.email ?? '—'}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge[status] ?? statusBadge.none}`}>
                    {status}
                  </span>
                </td>
                <td className="py-3 px-4 text-foreground-soft">
                  {c.balance !== 0 ? `$${(c.balance / 100).toFixed(2)}` : '—'}
                </td>
                <td className="py-3 px-4">
                  {c.delinquent ? (
                    <span className="text-destructive font-medium">Yes</span>
                  ) : (
                    <span className="text-faint">No</span>
                  )}
                </td>
                <td className="py-3 px-4 text-muted-foreground">
                  {new Date(c.created * 1000).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-faint font-mono text-xs">{c.id}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
