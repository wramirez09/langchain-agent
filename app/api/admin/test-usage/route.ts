import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { insertUsageLog } from '@/lib/db/repositories/usage.repo'

/**
 * Test endpoint to report usage for a customer
 * POST /api/admin/test-usage with JSON body:
 * { "customerId": "cus_...", "quantity": 100, "meterName": "preauthmeter", "userId": "user-uuid" }
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_session')?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { customerId, quantity = 100, meterName, userId } = await req.json()

  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  }

  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY
  if (!liveSecretKey) {
    return NextResponse.json({ error: 'STRIPE_LIVE_SECRET_KEY not configured' }, { status: 500 })
  }

  const stripe = new Stripe(liveSecretKey, {
    apiVersion: '2025-10-29.clover',
  })

  try {
    // 1. Get customer's active subscription
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    })

    if (!subs.data.length) {
      return NextResponse.json({ error: 'No active subscription found for customer' }, { status: 404 })
    }

    const subscription = subs.data[0]

    // 2. Find the metered subscription item
    const meteredItem = subscription.items.data.find(item => item.price.recurring?.usage_type === 'metered')

    if (!meteredItem) {
      return NextResponse.json({ error: 'No metered subscription item found' }, { status: 404 })
    }

    // 3. Report usage via meter events
    const eventName = meterName || process.env.STRIPE_METER_EVENT_NAME || 'llm_request'
    const idempotencyKey = `test-usage-${customerId}-${Date.now()}`

    const meterEvent = await stripe.billing.meterEvents.create(
      {
        event_name: eventName,
        payload: {
          stripe_customer_id: customerId,
          subscription_id: subscription.id,
          subscription_item_id: meteredItem.id,
          value: quantity.toString(),
        },
      },
      { idempotencyKey },
    )

    // 4. Log to database if userId provided
    let dbLogged = false
    if (userId) {
      try {
        await insertUsageLog({
          user_id: userId,
          usage_type: eventName,
          quantity,
          stripe_reported: true,
          stripe_usage_id: meterEvent.identifier,
          metered_item_id: meteredItem.id,
        })
        dbLogged = true
      } catch (logError) {
        console.warn('Failed to log usage to database:', logError)
        // Don't fail the operation if logging fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reported ${quantity} units of usage for customer ${customerId}`,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        customerId: subscription.customer,
      },
      meteredItem: {
        id: meteredItem.id,
        priceId: meteredItem.price.id,
      },
      meterEvent: {
        event_name: meterEvent.event_name,
        identifier: meterEvent.identifier,
        value: meterEvent.payload?.value,
      },
      databaseLogged: dbLogged,
    })
  } catch (error) {
    console.error('Test usage error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to report usage' },
      { status: 500 },
    )
  }
}

/**
 * GET endpoint to list active subscriptions with metered items
 * Useful for finding which customers to test with
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_session')?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY
  if (!liveSecretKey) {
    return NextResponse.json({ error: 'STRIPE_LIVE_SECRET_KEY not configured' }, { status: 500 })
  }

  const stripe = new Stripe(liveSecretKey, {
    apiVersion: '2025-10-29.clover',
  })

  try {
    // Get all active subscriptions
    const subs = await stripe.subscriptions.list({
      status: 'active',
      limit: 50,
      expand: ['data.items'],
    })

    // Filter to those with metered items
    const metered = subs.data
      .filter(sub => sub.items.data.some(item => item.price.recurring?.usage_type === 'metered'))
      .map(sub => {
        const customer = sub.customer as string
        const meteredItems = sub.items.data.filter(item => item.price.recurring?.usage_type === 'metered')
        return {
          subscriptionId: sub.id,
          customerId: customer,
          status: sub.status,
          meteredItems: meteredItems.map(item => ({
            id: item.id,
            priceId: item.price.id,
            priceNickname: item.price.nickname,
          })),
        }
      })

    return NextResponse.json({
      total: metered.length,
      subscriptions: metered,
      testEndpoint: 'POST /api/admin/test-usage with { "customerId": "cus_...", "quantity": 100, "meterName": "preauthmeter", "userId": "user-uuid" }',
    })
  } catch (error) {
    console.error('List subscriptions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list subscriptions' },
      { status: 500 },
    )
  }
}
