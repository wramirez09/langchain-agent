import type Stripe from 'stripe'

interface Props {
  charges: Stripe.Charge[]
  invoices: Stripe.Invoice[]
}

const chargeStatusBadge: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
}

const invoiceStatusBadge: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  open: 'bg-blue-100 text-blue-700',
  draft: 'bg-gray-100 text-gray-500',
  void: 'bg-gray-100 text-gray-400',
  uncollectible: 'bg-red-100 text-red-700',
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
    return <p className="text-sm text-gray-400 py-6 text-center">No payments found.</p>
  }

  const badgeMap = { ...chargeStatusBadge, ...invoiceStatusBadge }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Date</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Type</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Amount</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Description</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-gray-500">{new Date(row.date * 1000).toLocaleDateString()}</td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.type === 'charge' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {row.type}
                </span>
              </td>
              <td className="py-3 px-4 text-gray-700">{row.customer}</td>
              <td className="py-3 px-4 font-medium text-gray-900">
                ${(row.amount / 100).toFixed(2)} {row.currency.toUpperCase()}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeMap[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {row.status}
                </span>
              </td>
              <td className="py-3 px-4 text-gray-500 max-w-xs truncate">{row.description}</td>
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
