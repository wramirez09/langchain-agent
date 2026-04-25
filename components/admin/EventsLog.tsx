import type Stripe from 'stripe'

interface Props {
  events: Stripe.Event[]
}

const eventTypeColor: Record<string, string> = {
  'customer.subscription': 'bg-blue-100 text-blue-700',
  'invoice.payment': 'bg-green-100 text-green-700',
  'charge.dispute': 'bg-red-100 text-red-700',
  'charge.refund': 'bg-amber-100 text-amber-700',
  'checkout.session': 'bg-purple-100 text-purple-700',
  'billing_portal': 'bg-indigo-100 text-indigo-700',
}

function eventColor(type: string) {
  for (const prefix of Object.keys(eventTypeColor)) {
    if (type.startsWith(prefix)) return eventTypeColor[prefix]
  }
  return 'bg-gray-100 text-gray-600'
}

export function EventsLog({ events }: Props) {
  if (!events.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No events found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Time</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Event Type</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">API Version</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Pending Webhooks</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Event ID</th>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <tr key={event.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                {new Date(event.created * 1000).toLocaleString()}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${eventColor(event.type)}`}>
                  {event.type}
                </span>
              </td>
              <td className="py-3 px-4 text-gray-400 font-mono text-xs">{event.api_version ?? '—'}</td>
              <td className="py-3 px-4 text-gray-600 text-center">{event.pending_webhooks}</td>
              <td className="py-3 px-4 text-gray-400 font-mono text-xs">{event.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
