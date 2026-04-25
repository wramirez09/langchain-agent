import type Stripe from 'stripe'

interface Props {
  subscriptions: Stripe.Subscription[]
  customers: Stripe.Customer[]
}

const statusBadge: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-100 text-gray-600',
  unpaid: 'bg-red-100 text-red-700',
  incomplete: 'bg-orange-100 text-orange-700',
  incomplete_expired: 'bg-gray-100 text-gray-400',
  paused: 'bg-purple-100 text-purple-700',
}

function customerEmail(customerId: string, customers: Stripe.Customer[]) {
  return customers.find(c => c.id === customerId)?.email ?? customerId
}

export function SubscriptionsTable({ subscriptions, customers }: Props) {
  if (!subscriptions.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No subscriptions found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Start Date</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Billing Anchor</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Cancel At</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Trial End</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Items</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Collection</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Sub ID</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map(s => {
            const items = s.items.data
            return (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-gray-700">{customerEmail(s.customer as string, customers)}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge[s.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-500">{new Date(s.start_date * 1000).toLocaleDateString()}</td>
                <td className="py-3 px-4 text-gray-500">{new Date(s.billing_cycle_anchor * 1000).toLocaleDateString()}</td>
                <td className="py-3 px-4 text-gray-500">
                  {s.cancel_at ? new Date(s.cancel_at * 1000).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {s.trial_end ? new Date(s.trial_end * 1000).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 px-4 text-gray-600 text-xs">
                  {items.map(item => (
                    <div key={item.id}>
                      {item.price.nickname ?? item.price.id} — ${((item.price.unit_amount ?? 0) / 100).toFixed(2)}/{item.price.recurring?.interval ?? 'one-time'}
                    </div>
                  ))}
                </td>
                <td className="py-3 px-4 text-gray-500 capitalize">{s.collection_method.replace('_', ' ')}</td>
                <td className="py-3 px-4 text-gray-400 font-mono text-xs">{s.id}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
