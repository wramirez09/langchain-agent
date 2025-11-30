import Stripe from 'stripe';

const stripe = (() => {
    if (!process.env.STRIPE_SECRET_KEY) {
        console.error('STRIPE_SECRET_KEY is missing');
        return null;
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-10-29.clover', // Always pin to a specific API version
    });
})();

export default stripe;