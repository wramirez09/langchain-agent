import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";

const CheckoutSessionSchema = z.object({
    flatPriceId: z.string().min(1, "Flat price ID is required"),
    meteredPriceId: z.string().min(1, "Metered price ID is required"),
    email: z.string().email("Invalid email address"),
});

export async function POST(req: Request) {
    try {
      const body = await req.json();
      const validation = CheckoutSessionSchema.safeParse(body);

      if (!validation.success) {
          const errorMessage = Object.values(validation.error.format())
              .flatMap((e) => {
                  if (Array.isArray(e)) {
                      return e;
                  }
                  return e?._errors || [];
              })
              .filter(Boolean)
              .join(", ");

        return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

      const { flatPriceId, meteredPriceId, email } = validation.data;

      const [flatPrice, meteredPrice] = await Promise.all([
          stripe.prices.retrieve(flatPriceId),
          stripe.prices.retrieve(meteredPriceId),
      ]);

      if (!flatPrice.active || !meteredPrice.active) {
          return NextResponse.json(
          { error: "One or more prices are inactive" },
          { status: 400 }
      );
    }

      const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
        line_items: [
            { price: flatPriceId, quantity: 1 },
            { price: meteredPriceId, quantity: 1 },
        ],
        customer_email: email,
        metadata: { email },
        success_url: `http://${process.env.NEXT_PUBLIC_BASE_URL}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
        cancel_url: `http://${process.env.NEXT_PUBLIC_BASE_URL}/sign-up?cancelled=true`,
    });

      if (!session.url) {
          throw new Error("Failed to create checkout session");
      }

      return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: unknown) {
      console.error("Checkout session error:", err);
      const errorMessage = err instanceof Error ? err.message : "Internal server error";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}