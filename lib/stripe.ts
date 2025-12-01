// lib/stripe.ts
import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      // In dev, fail fast. In prod builds, you may prefer to only warn.
      if (process.env.NODE_ENV !== "production") {
          throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
      } else {
          console.error("STRIPE_SECRET_KEY is not set in environment variables");
      }
  }

    if (!stripeInstance) {
        stripeInstance = new Stripe(secretKey as string, {
            apiVersion: "2025-10-29.clover",
    });
  }

    return stripeInstance;
}

// ❌ DO NOT do this anymore:
// export default getStripe();
