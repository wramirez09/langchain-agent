import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Stripe from 'stripe'

/**
 * GET endpoint to list all billing meters for debugging
 */
export async function GET() {
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
    const meters = await stripe.billing.meters.list({ limit: 50 })

    return NextResponse.json({
      total: meters.data.length,
      meters: meters.data.map(m => ({
        id: m.id,
        event_name: m.event_name,
        display_name: m.display_name,
        status: m.status,
        created: m.created,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list meters' },
      { status: 500 },
    )
  }
}
