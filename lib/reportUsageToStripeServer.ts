import { stripe } from "@/lib/stripe";

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