import type Stripe from 'stripe'

export interface UsageRow {
  customerId: string
  customerEmail: string
  meterId: string
  meterName: string
  totalUsage: number
  startTime: number
  endTime: number
}

interface Props {
  rows: UsageRow[]
  meters: Stripe.Billing.Meter[]
}

export function UsageTable({ rows, meters }: Props) {
  if (!rows.length) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-faint">No usage data found.</p>
        <p className="text-xs text-faint mt-1">
          {meters.length === 0 ? 'No billing meters configured.' : `${meters.length} meter(s) found but no event summaries.`}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Meter</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total Usage</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Period Start</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Period End</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border hover:bg-accent transition-colors">
              <td className="py-3 px-4 text-foreground-soft">{row.customerEmail || row.customerId}</td>
              <td className="py-3 px-4 text-foreground-soft">{row.meterName}</td>
              <td className="py-3 px-4 font-medium text-foreground">{row.totalUsage.toLocaleString()}</td>
              <td className="py-3 px-4 text-muted-foreground">{new Date(row.startTime * 1000).toLocaleDateString()}</td>
              <td className="py-3 px-4 text-muted-foreground">{new Date(row.endTime * 1000).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
