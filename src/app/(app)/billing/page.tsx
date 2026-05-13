import { CreditBalanceCard } from "@/components/billing/CreditBalanceCard";
import { CreditPackCard } from "@/components/billing/CreditPackCard";
import { CREDIT_PACKS } from "@/lib/billing";
import { getUserCredits } from "@/lib/credits";
import type { CheckoutStatus } from "@/types";

type BillingPageProps = {
  searchParams: Promise<{
    checkout?: string;
  }>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const checkoutStatus: CheckoutStatus | undefined =
    params.checkout === "success" || params.checkout === "cancelled"
      ? params.checkout
      : undefined;
  const creditsBalance = (await getUserCredits()) ?? 0;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Billing</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Buy credits to unlock more books. No subscription required.
        </p>
      </header>

      {checkoutStatus === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Payment received. Your credits will appear shortly.
        </p>
      )}

      {checkoutStatus === "cancelled" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Checkout cancelled. No credits were added.
        </p>
      )}

      <CreditBalanceCard balance={creditsBalance} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <CreditPackCard key={pack.id} pack={pack} />
        ))}
      </div>

      <p className="text-sm text-slate-600">Credits do not expire during the MVP.</p>
    </section>
  );
}