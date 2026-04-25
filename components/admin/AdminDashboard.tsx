'use client'

import { useState } from 'react'
import type Stripe from 'stripe'
import { StatCard } from './StatCard'
import { CustomerTable } from './CustomerTable'
import { SubscriptionsTable } from './SubscriptionsTable'
import { PaymentsTable } from './PaymentsTable'
import { UsageTable, type UsageRow } from './UsageTable'
import { DisputesRefundsTable } from './DisputesRefundsTable'
import { EventsLog } from './EventsLog'

interface Props {
  customers: Stripe.Customer[]
  subscriptions: Stripe.Subscription[]
  invoices: Stripe.Invoice[]
  charges: Stripe.Charge[]
  balance: Stripe.Balance
  refunds: Stripe.Refund[]
  disputes: Stripe.Dispute[]
  events: Stripe.Event[]
  meters: Stripe.Billing.Meter[]
  usageRows: UsageRow[]
}

const tabs = [
  'Overview',
  'Customers',
  'Subscriptions',
  'Payments',
  'Usage',
  'Disputes & Refunds',
  'Events',
] as const

type Tab = (typeof tabs)[number]

function fmt(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function computeOverview(
  customers: Stripe.Customer[],
  subscriptions: Stripe.Subscription[],
  invoices: Stripe.Invoice[],
  charges: Stripe.Charge[],
  balance: Stripe.Balance,
) {
  const activeSubs = subscriptions.filter(s => s.status === 'active')
  const mrr = activeSubs.reduce((acc, s) => {
    return acc + s.items.data.reduce((sum, item) => {
      const amount = item.price.unit_amount ?? 0
      const interval = item.price.recurring?.interval
      if (interval === 'year') return sum + amount / 12
      return sum + amount
    }, 0)
  }, 0)

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
  const recentCharges = charges
    .filter(c => c.created > thirtyDaysAgo && c.status === 'succeeded')
    .reduce((acc, c) => acc + c.amount, 0)

  const outstandingInvoices = invoices
    .filter(inv => inv.status === 'open')
    .reduce((acc, inv) => acc + (inv.amount_due ?? 0), 0)

  const availableBalance = balance.available.reduce((acc, b) => acc + b.amount, 0)
  const pendingBalance = balance.pending.reduce((acc, b) => acc + b.amount, 0)

  return {
    mrr,
    arr: mrr * 12,
    totalCustomers: customers.length,
    activeSubs: activeSubs.length,
    recentCharges,
    outstandingInvoices,
    availableBalance,
    pendingBalance,
  }
}

export function AdminDashboard({
  customers,
  subscriptions,
  invoices,
  charges,
  balance,
  refunds,
  disputes,
  events,
  meters,
  usageRows,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const stats = computeOverview(customers, subscriptions, invoices, charges, balance)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Stripe Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Live data from your Stripe account</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="MRR" value={fmt(stats.mrr)} color="green" />
            <StatCard label="ARR" value={fmt(stats.arr)} color="green" sub="MRR × 12" />
            <StatCard label="Total Customers" value={stats.totalCustomers.toString()} color="blue" />
            <StatCard label="Active Subscriptions" value={stats.activeSubs.toString()} color="blue" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Charges (30d)" value={fmt(stats.recentCharges)} color="default" sub="Succeeded only" />
            <StatCard label="Outstanding Invoices" value={fmt(stats.outstandingInvoices)} color={stats.outstandingInvoices > 0 ? 'amber' : 'default'} />
            <StatCard label="Available Balance" value={fmt(stats.availableBalance)} color="default" />
            <StatCard label="Pending Balance" value={fmt(stats.pendingBalance)} color="default" sub="Awaiting settlement" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Open Disputes" value={disputes.filter(d => d.status === 'needs_response' || d.status === 'under_review').length.toString()} color={disputes.some(d => d.status === 'needs_response') ? 'red' : 'default'} />
            <StatCard label="Total Refunds" value={refunds.length.toString()} color="default" />
            <StatCard label="Canceled Subscriptions" value={subscriptions.filter(s => s.status === 'canceled').length.toString()} color="default" />
            <StatCard label="Past Due" value={subscriptions.filter(s => s.status === 'past_due').length.toString()} color={subscriptions.some(s => s.status === 'past_due') ? 'amber' : 'default'} />
          </div>
        </div>
      )}

      {/* Customers */}
      {activeTab === 'Customers' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{customers.length} Customers</h2>
          </div>
          <CustomerTable customers={customers} subscriptions={subscriptions} />
        </div>
      )}

      {/* Subscriptions */}
      {activeTab === 'Subscriptions' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{subscriptions.length} Subscriptions</h2>
          </div>
          <SubscriptionsTable subscriptions={subscriptions} customers={customers} />
        </div>
      )}

      {/* Payments */}
      {activeTab === 'Payments' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {charges.length} Charges · {invoices.length} Invoices
            </h2>
          </div>
          <PaymentsTable charges={charges} invoices={invoices} />
        </div>
      )}

      {/* Usage */}
      {activeTab === 'Usage' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Metered Usage</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {meters.length} meter(s): {meters.map(m => m.display_name).join(', ')}
            </p>
          </div>
          <UsageTable rows={usageRows} meters={meters} />
        </div>
      )}

      {/* Disputes & Refunds */}
      {activeTab === 'Disputes & Refunds' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {disputes.length} Disputes · {refunds.length} Refunds
            </h2>
          </div>
          <DisputesRefundsTable disputes={disputes} refunds={refunds} />
        </div>
      )}

      {/* Events */}
      {activeTab === 'Events' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Events</h2>
          </div>
          <EventsLog events={events} />
        </div>
      )}
    </div>
  )
}
