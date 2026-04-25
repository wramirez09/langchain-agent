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
        <p className="text-sm text-gray-400">No usage data found.</p>
        <p className="text-xs text-gray-300 mt-1">
          {meters.length === 0 ? 'No billing meters configured.' : `${meters.length} meter(s) found but no event summaries.`}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Meter</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Total Usage</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Period Start</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Period End</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-gray-700">{row.customerEmail || row.customerId}</td>
              <td className="py-3 px-4 text-gray-600">{row.meterName}</td>
              <td className="py-3 px-4 font-medium text-gray-900">{row.totalUsage.toLocaleString()}</td>
              <td className="py-3 px-4 text-gray-500">{new Date(row.startTime * 1000).toLocaleDateString()}</td>
              <td className="py-3 px-4 text-gray-500">{new Date(row.endTime * 1000).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
