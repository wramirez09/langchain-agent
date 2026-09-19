import type Stripe from 'stripe'

interface Props {
  charges: Stripe.Charge[]
  invoices: Stripe.Invoice[]
}

const chargeStatusBadge: Record<string, string> = {
  succeeded: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
}

const invoiceStatusBadge: Record<string, string> = {
  paid: 'bg-success/10 text-success',
  open: 'bg-primary/10 text-blue-700',
  draft: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-faint',
  uncollectible: 'bg-destructive/10 text-destructive',
}

type Row = {
  id: string
  type: 'charge' | 'invoice'
  amount: number
  currency: string
  status: string
  customer: string
  description: string
  date: number
  url?: string | null
}

export function PaymentsTable({ charges, invoices }: Props) {
  const rows: Row[] = [
    ...charges.map(c => ({
      id: c.id,
      type: 'charge' as const,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      customer: c.billing_details?.email ?? (c.customer as string) ?? '—',
      description: c.description ?? '—',
      date: c.created,
      url: c.receipt_url,
    })),
    ...invoices.map(inv => ({
      id: inv.id,
      type: 'invoice' as const,
      amount: inv.amount_paid,
      currency: inv.currency,
      status: inv.status ?? 'unknown',
      customer: inv.customer_email ?? (inv.customer as string) ?? '—',
      description: inv.description ?? inv.billing_reason ?? '—',
      date: inv.created,
      url: inv.hosted_invoice_url,
    })),
  ].sort((a, b) => b.date - a.date)

  if (!rows.length) {
    return <p className="text-sm text-faint py-6 text-center">No payments found.</p>
  }

  const badgeMap = { ...chargeStatusBadge, ...invoiceStatusBadge }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Description</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-b border-border hover:bg-accent transition-colors">
              <td className="py-3 px-4 text-muted-foreground">{new Date(row.date * 1000).toLocaleDateString()}</td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.type === 'charge' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'}`}>
                  {row.type}
                </span>
              </td>
              <td className="py-3 px-4 text-foreground-soft">{row.customer}</td>
              <td className="py-3 px-4 font-medium text-foreground">
                ${(row.amount / 100).toFixed(2)} {row.currency.toUpperCase()}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeMap[row.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {row.status}
                </span>
              </td>
              <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">{row.description}</td>
              <td className="py-3 px-4">
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                    View
                  </a>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
