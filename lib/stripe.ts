import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    if (stripeInstance) return stripeInstance;

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      const error = "STRIPE_SECRET_KEY is not set in environment variables";
      console.error(error);
      throw new Error(error);
  }

    stripeInstance = new Stripe(secretKey, {
        apiVersion: "2025-10-29.clover",
    });

    return stripeInstance;
}