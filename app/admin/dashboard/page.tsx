import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getStripe } from '@/lib/stripe'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import type { UsageRow } from '@/components/admin/UsageTable'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_session')?.value !== '1') {
    redirect('/admin')
  }

  // Shares the app-wide client rather than a second STRIPE_LIVE_SECRET_KEY.
  // That variable was set in no environment, so this page threw on render —
  // a hard 500 for the whole admin dashboard. The environment now decides
  // live vs test, which is the same invariant every other Stripe caller uses.
  const stripe = getStripe()

  const [
    customersRes,
    subscriptionsRes,
    invoicesRes,
    chargesRes,
    balance,
    refundsRes,
    disputesRes,
    eventsRes,
    metersRes,
  ] = await Promise.all([
    stripe.customers.list({ limit: 100 }),
    stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.items'] }),
    stripe.invoices.list({ limit: 100 }),
    stripe.charges.list({ limit: 100 }),
    stripe.balance.retrieve(),
    stripe.refunds.list({ limit: 100 }),
    stripe.disputes.list({ limit: 100 }),
    stripe.events.list({ limit: 50 }),
    stripe.billing.meters.list(),
  ])

  const customers = customersRes.data
  const subscriptions = subscriptionsRes.data
  const invoices = invoicesRes.data
  const charges = chargesRes.data
  const refunds = refundsRes.data
  const disputes = disputesRes.data
  const events = eventsRes.data
  const meters = metersRes.data

  // Fetch usage summaries per customer per meter for current billing period
  const usageRows: UsageRow[] = []

  if (meters.length > 0) {
    // Async Server Component, not a React render: this runs once per request
    // while fetching Stripe usage, so a wall-clock read is correct here.
    // eslint-disable-next-line react-hooks/purity
    const now = Math.floor(Date.now() / 1000)
    // Use a 30-day window ending now
    const windowStart = now - 30 * 24 * 60 * 60

    await Promise.all(
      meters.map(async meter => {
        await Promise.all(
          customers.map(async customer => {
            try {
              const summaries = await stripe.billing.meters.listEventSummaries(meter.id, {
                customer: customer.id,
                start_time: windowStart,
                end_time: now,
                limit: 10,
              })
              for (const summary of summaries.data) {
                usageRows.push({
                  customerId: customer.id,
                  customerEmail: customer.email ?? '',
                  meterId: meter.id,
                  meterName: meter.display_name,
                  totalUsage: summary.aggregated_value,
                  startTime: summary.start_time,
                  endTime: summary.end_time,
                })
              }
            } catch {
              // Customer may have no usage for this meter — skip silently
            }
          }),
        )
      }),
    )
  }

  return (
    <AdminDashboard
      customers={customers}
      subscriptions={subscriptions}
      invoices={invoices}
      charges={charges}
      balance={balance}
      refunds={refunds}
      disputes={disputes}
      events={events}
      meters={meters}
      usageRows={usageRows.sort((a, b) => b.totalUsage - a.totalUsage)}
    />
  )
}
