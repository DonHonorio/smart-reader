import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { CreditPack } from "@/types";

type CreditPackCardProps = {
  pack: CreditPack;
};

export function CreditPackCard({ pack }: CreditPackCardProps) {
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
        disabled
      >
        Buy credits
      </Button>
      <p className="mt-2 text-xs text-slate-500">Coming soon</p>
    </article>
  );
}