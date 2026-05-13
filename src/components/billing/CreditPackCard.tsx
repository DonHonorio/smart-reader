"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { CreateCheckoutSessionResponse, CreditPack } from "@/types";

type CreditPackCardProps = {
  pack: CreditPack;
};

const CHECKOUT_START_ERROR_MESSAGE = "Could not start checkout. Please try again.";

export function CreditPackCard({ pack }: CreditPackCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packId: pack.id }),
      });

      let payload: CreateCheckoutSessionResponse | null = null;

      try {
        payload = (await response.json()) as CreateCheckoutSessionResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(CHECKOUT_START_ERROR_MESSAGE);
      }

      if (!payload || !("url" in payload) || typeof payload.url !== "string" || !payload.url) {
        throw new Error(CHECKOUT_START_ERROR_MESSAGE);
      }

      window.location.href = payload.url;
    } catch {
      setIsLoading(false);
      setError(CHECKOUT_START_ERROR_MESSAGE);
    }
  }

  return (
    <article
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm",
        pack.highlighted && "border-slate-900 ring-1 ring-slate-900/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{pack.name}</h2>
        {pack.badge && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {pack.badge}
          </span>
        )}
      </div>

      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{pack.displayPrice}</p>
      <p className="mt-1 text-sm text-slate-600">{pack.pricePerBook}</p>

      <p className="mt-5 text-base font-semibold text-slate-900">
        {pack.credits} {pack.credits === 1 ? "credit" : "credits"}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{pack.description}</p>

      <Button
        variant={pack.highlighted ? "primary" : "secondary"}
        className="mt-6 w-full"
        onClick={handleCheckout}
        disabled={isLoading}
      >
        {isLoading ? "Redirecting..." : "Buy credits"}
      </Button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </article>
  );
}