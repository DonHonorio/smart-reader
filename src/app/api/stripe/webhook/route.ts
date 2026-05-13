import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getCreditPackById } from "@/lib/billing";
import { addPurchasedCredits } from "@/lib/credits";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

const WEBHOOK_SIGNATURE_ERROR = "Invalid Stripe signature.";
const WEBHOOK_GENERIC_ERROR = "Could not process Stripe webhook.";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET.");
    return jsonError(WEBHOOK_GENERIC_ERROR, 500);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return jsonError(WEBHOOK_SIGNATURE_ERROR, 400);
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("/api/stripe/webhook signature verification error:", error);
    return jsonError(WEBHOOK_SIGNATURE_ERROR, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};

  const userId = normalizeText(metadata.userId ?? "");
  const packId = normalizeText(metadata.packId ?? "");

  if (!userId || !packId) {
    console.error("/api/stripe/webhook invalid checkout metadata:", {
      sessionId: session.id,
      metadata,
    });

    return NextResponse.json({ received: true, ignored: true });
  }

  const pack = getCreditPackById(packId);

  if (!pack) {
    console.error("/api/stripe/webhook unknown pack id:", {
      sessionId: session.id,
      packId,
    });

    return NextResponse.json({ received: true, ignored: true });
  }

  const result = await addPurchasedCredits({
    userId,
    credits: pack.credits,
    reason: `Purchase: ${pack.name}`,
    stripeSessionId: session.id,
  });

  if (!result.success) {
    console.error("/api/stripe/webhook addPurchasedCredits error:", {
      sessionId: session.id,
      userId,
      packId,
    });

    return jsonError(WEBHOOK_GENERIC_ERROR, 500);
  }

  return NextResponse.json({
    received: true,
    alreadyProcessed: result.alreadyProcessed,
  });
}