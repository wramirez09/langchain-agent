import Stripe from "stripe";

// Only throw the error at runtime, not during build
const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-10-29.clover",
    });
};

const stripe = getStripe();
export default stripe;