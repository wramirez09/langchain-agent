import type Stripe from 'stripe'

interface Props {
  disputes: Stripe.Dispute[]
  refunds: Stripe.Refund[]
}

const disputeStatusBadge: Record<string, string> = {
  warning_needs_response: 'bg-amber-100 text-amber-700',
  warning_under_review: 'bg-amber-100 text-amber-700',
  warning_closed: 'bg-gray-100 text-gray-500',
  needs_response: 'bg-red-100 text-red-700',
  under_review: 'bg-blue-100 text-blue-700',
  charge_refunded: 'bg-green-100 text-green-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
}

const refundStatusBadge: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-500',
  requires_action: 'bg-blue-100 text-blue-700',
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
    return <p className="text-sm text-gray-400 py-6 text-center">No disputes or refunds found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Date</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Type</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Amount</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Reason</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Charge ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const badgeMap = row.type === 'dispute' ? disputeStatusBadge : refundStatusBadge
            return (
              <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-gray-500">{new Date(row.date * 1000).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.type === 'dispute' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                    {row.type}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-gray-900">
                  ${(row.amount / 100).toFixed(2)} {row.currency.toUpperCase()}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeMap[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {row.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-500 capitalize">{row.reason.replace(/_/g, ' ')}</td>
                <td className="py-3 px-4 text-gray-400 font-mono text-xs">{row.chargeId}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
