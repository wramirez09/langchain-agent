import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getStripe } from '@/lib/stripe'

/**
 * GET endpoint to list all billing meters for debugging
 */
export async function GET() {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_session')?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 })
  }

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
