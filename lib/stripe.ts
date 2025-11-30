import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
        // Only throw at runtime, not during build
        if (typeof window === 'undefined') {
        throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
        } else {
            throw new Error('Payment service is not properly configured');
        }
        }

        stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2025-10-29.clover', // Use a stable API version
    });
    }

    return stripeInstance;
}

// Default export for backward compatibility
const stripe = process.env.STRIPE_SECRET_KEY
    ? getStripe()
    : null;
export default stripe;