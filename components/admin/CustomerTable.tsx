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
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-100 text-gray-600',
  unpaid: 'bg-red-100 text-red-700',
  none: 'bg-gray-100 text-gray-400',
}

export function CustomerTable({ customers, subscriptions }: Props) {
  if (!customers.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No customers found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Subscription</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Balance</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Delinquent</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Created</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Customer ID</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
            const status = subStatus(c.id, subscriptions)
            return (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 font-medium text-gray-900">{c.name ?? '—'}</td>
                <td className="py-3 px-4 text-gray-600">{c.email ?? '—'}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge[status] ?? statusBadge.none}`}>
                    {status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-600">
                  {c.balance !== 0 ? `$${(c.balance / 100).toFixed(2)}` : '—'}
                </td>
                <td className="py-3 px-4">
                  {c.delinquent ? (
                    <span className="text-red-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(c.created * 1000).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-gray-400 font-mono text-xs">{c.id}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
