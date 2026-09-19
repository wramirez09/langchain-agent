import type Stripe from 'stripe'

interface Props {
  disputes: Stripe.Dispute[]
  refunds: Stripe.Refund[]
}

const disputeStatusBadge: Record<string, string> = {
  warning_needs_response: 'bg-warning/10 text-warning',
  warning_under_review: 'bg-warning/10 text-warning',
  warning_closed: 'bg-muted text-muted-foreground',
  needs_response: 'bg-destructive/10 text-destructive',
  under_review: 'bg-primary/10 text-blue-700',
  charge_refunded: 'bg-success/10 text-success',
  won: 'bg-success/10 text-success',
  lost: 'bg-destructive/10 text-destructive',
}

const refundStatusBadge: Record<string, string> = {
  succeeded: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
  canceled: 'bg-muted text-muted-foreground',
  requires_action: 'bg-primary/10 text-blue-700',
}

type Row = {
  id: string
  type: 'dispute' | 'refund'
  amount: number
  currency: string
  status: string
  reason: string
  date: number
  chargeId: string
}

export function DisputesRefundsTable({ disputes, refunds }: Props) {
  const rows: Row[] = [
    ...disputes.map(d => ({
      id: d.id,
      type: 'dispute' as const,
      amount: d.amount,
      currency: d.currency,
      status: d.status,
      reason: d.reason,
      date: d.created,
      chargeId: d.charge as string,
    })),
    ...refunds.map(r => ({
      id: r.id,
      type: 'refund' as const,
      amount: r.amount,
      currency: r.currency,
      status: r.status ?? 'unknown',
      reason: r.reason ?? '—',
      date: r.created,
      chargeId: r.charge as string ?? '—',
    })),
  ].sort((a, b) => b.date - a.date)

  if (!rows.length) {
    return <p className="text-sm text-faint py-6 text-center">No disputes or refunds found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Reason</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Charge ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const badgeMap = row.type === 'dispute' ? disputeStatusBadge : refundStatusBadge
            return (
              <tr key={row.id} className="border-b border-border hover:bg-accent transition-colors">
                <td className="py-3 px-4 text-muted-foreground">{new Date(row.date * 1000).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.type === 'dispute' ? 'bg-destructive/5 text-destructive' : 'bg-muted text-foreground-soft'}`}>
                    {row.type}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-foreground">
                  ${(row.amount / 100).toFixed(2)} {row.currency.toUpperCase()}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeMap[row.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {row.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-muted-foreground capitalize">{row.reason.replace(/_/g, ' ')}</td>
                <td className="py-3 px-4 text-faint font-mono text-xs">{row.chargeId}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
