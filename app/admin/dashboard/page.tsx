import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Stripe from 'stripe'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import type { UsageRow } from '@/components/admin/UsageTable'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_session')?.value !== '1') {
    redirect('/admin')
  }

  // Use live Stripe key for admin dashboard
  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY
  if (!liveSecretKey) {
    throw new Error('STRIPE_LIVE_SECRET_KEY is not set in environment variables')
  }

  const stripe = new Stripe(liveSecretKey, {
    apiVersion: '2025-10-29.clover',
  })

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
