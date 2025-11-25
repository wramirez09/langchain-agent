import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-10-29.clover" });

export async function reportUsageToStripeServer(subscriptionItemId: string, quantity = 1) {
    // Type assertion fixes TS error
    const usageRecord = await (stripe.subscriptionItems as any).createUsageRecord(
        subscriptionItemId,
        {
            quantity,
            timestamp: Math.floor(Date.now() / 1000),
            action: "increment",
        }
    );

    return usageRecord;
}