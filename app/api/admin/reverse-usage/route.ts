import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Stripe from 'stripe'

/**
 * Cancel a meter event by its identifier
 * POST /api/admin/reverse-usage with JSON body:
 * { "meterName": "preauthmeter", "eventIdentifier": "event-uuid" }
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_session')?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { meterName, eventIdentifier } = await req.json()

  if (!meterName || !eventIdentifier) {
    return NextResponse.json({ error: 'meterName and eventIdentifier required' }, { status: 400 })
  }

  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY
  if (!liveSecretKey) {
    return NextResponse.json({ error: 'STRIPE_LIVE_SECRET_KEY not configured' }, { status: 500 })
  }

  const stripe = new Stripe(liveSecretKey, {
    apiVersion: '2025-10-29.clover',
  })

  try {
    // Cancel the meter event
    const adjustment = await stripe.billing.meterEventAdjustments.create({
      event_name: meterName,
      type: 'cancel',
      cancel: {
        identifier: eventIdentifier,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Canceled meter event ${eventIdentifier}`,
      adjustment: {
        status: adjustment.status,
        event_name: adjustment.event_name,
        type: adjustment.type,
      },
    })
  } catch (error) {
    console.error('Reverse usage error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel event' },
      { status: 500 },
    )
  }
}
