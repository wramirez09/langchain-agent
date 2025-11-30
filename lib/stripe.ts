import Stripe from 'stripe';

// Singleton instance
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    if (!stripeInstance) {
        const secretKey = process.env.STRIPE_SECRET_KEY;

        if (!secretKey) {
            const error = 'STRIPE_SECRET_KEY is not set in environment variables';
            console.error(error);
            throw new Error(error);
    }

        stripeInstance = new Stripe(secretKey, {
            apiVersion: '2025-10-29.clover', // Use the latest stable version
    });
    }

    return stripeInstance;
}

// For backward compatibility
export default getStripe();