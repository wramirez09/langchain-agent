import type Stripe from 'stripe'

interface Props {
  events: Stripe.Event[]
}

const eventTypeColor: Record<string, string> = {
  'customer.subscription': 'bg-primary/10 text-blue-700',
  'invoice.payment': 'bg-success/10 text-success',
  'charge.dispute': 'bg-destructive/10 text-destructive',
  'charge.refund': 'bg-warning/10 text-warning',
  'checkout.session': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  'billing_portal': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
}

function eventColor(type: string) {
  for (const prefix of Object.keys(eventTypeColor)) {
    if (type.startsWith(prefix)) return eventTypeColor[prefix]
  }
  return 'bg-muted text-foreground-soft'
}

export function EventsLog({ events }: Props) {
  if (!events.length) {
    return <p className="text-sm text-faint py-6 text-center">No events found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Event Type</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">API Version</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Pending Webhooks</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Event ID</th>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <tr key={event.id} className="border-b border-border hover:bg-accent transition-colors">
              <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                {new Date(event.created * 1000).toLocaleString()}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${eventColor(event.type)}`}>
                  {event.type}
                </span>
              </td>
              <td className="py-3 px-4 text-faint font-mono text-xs">{event.api_version ?? '—'}</td>
              <td className="py-3 px-4 text-foreground-soft text-center">{event.pending_webhooks}</td>
              <td className="py-3 px-4 text-faint font-mono text-xs">{event.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
