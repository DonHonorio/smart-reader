import { NextResponse } from "next/server";
import { getCreditPackById } from "@/lib/billing";
import { addPurchasedCredits } from "@/lib/credits";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

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
    return jsonError("Webhook service is not configured.", 500);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return jsonError("Missing stripe-signature header.", 400);
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("/api/stripe/webhook signature verification error:", error);
    return jsonError("Invalid Stripe signature.", 400);
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const metadata = session.metadata ?? {};

  const userId = normalizeText(metadata.userId ?? "");
  const packId = normalizeText(metadata.packId ?? "");

  if (!userId || !packId) {
    console.error("/api/stripe/webhook invalid checkout metadata:", {
      sessionId: session.id,
      metadata,
    });

    return jsonError("Invalid checkout metadata.", 400);
  }

  const pack = getCreditPackById(packId);

  if (!pack) {
    console.error("/api/stripe/webhook unknown pack id:", {
      sessionId: session.id,
      packId,
    });

    return jsonError("Invalid checkout metadata.", 400);
  }

  const result = await addPurchasedCredits({
    userId,
    credits: pack.credits,
    reason: `Purchase: ${pack.name}`,
    stripeSessionId: session.id,
  });

  if (!result.success) {
    return jsonError(result.error, 500);
  }

  return NextResponse.json({
    received: true,
    alreadyProcessed: result.alreadyProcessed,
  });
}