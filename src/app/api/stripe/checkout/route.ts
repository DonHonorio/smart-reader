import { NextResponse } from "next/server";
import { getCreditPackById } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

type CheckoutRequestBody = {
  packId: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const { packId } = (body ?? {}) as Partial<CheckoutRequestBody>;

  if (typeof packId !== "string") {
    return jsonError("packId is required.", 400);
  }

  const normalizedPackId = normalizeText(packId);

  if (!normalizedPackId) {
    return jsonError("packId is required.", 400);
  }

  const pack = getCreditPackById(normalizedPackId);

  if (!pack) {
    return jsonError("Invalid packId.", 400);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    console.error("Missing NEXT_PUBLIC_APP_URL.");
    return jsonError("Checkout service is temporarily unavailable.", 500);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("Authentication required.", 401);
    }

    const baseAppUrl = appUrl.replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: pack.name,
            },
            unit_amount: pack.priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseAppUrl}/billing?checkout=success`,
      cancel_url: `${baseAppUrl}/billing?checkout=cancelled`,
      metadata: {
        userId: user.id,
        packId: pack.id,
        credits: String(pack.credits),
      },
      ...(user.email ? { customer_email: user.email } : {}),
    });

    if (!session.url) {
      return jsonError("Could not create checkout session.", 500);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("/api/stripe/checkout unexpected error:", error);
    return jsonError("Could not create checkout session.", 500);
  }
}