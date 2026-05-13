import { cn } from "@/lib/utils";
import type { CreditTransaction } from "@/types";

type CreditTransactionItemProps = {
  transaction: CreditTransaction;
};

const CREDIT_TRANSACTION_LABELS: Record<CreditTransaction["type"], string> = {
  signup_bonus: "Free signup credit",
  purchase: "Credit purchase",
  book_unlock: "Book unlocked",
  refund: "Refund",
  adjustment: "Adjustment",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPrimaryText(transaction: CreditTransaction) {
  if (transaction.type === "signup_bonus") {
    return CREDIT_TRANSACTION_LABELS.signup_bonus;
  }

  const normalizedReason = normalizeText(transaction.reason);

  if (normalizedReason.length > 0) {
    return normalizedReason;
  }

  return CREDIT_TRANSACTION_LABELS[transaction.type];
}

function getSignedAmount(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

export function CreditTransactionItem({ transaction }: CreditTransactionItemProps) {
  const isPositive = transaction.amount > 0;
  const isNegative = transaction.amount < 0;
  const amountTone = isPositive
    ? "text-emerald-700"
    : isNegative
      ? "text-rose-700"
      : "text-slate-700";
  const directionLabel = isPositive ? "Added" : isNegative ? "Used" : "No change";

  return (
    <li className="flex items-start justify-between gap-3 py-3 sm:py-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-slate-900">{getPrimaryText(transaction)}</p>
        <p className="text-xs text-slate-500">{formatCreatedAt(transaction.created_at)}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("text-sm font-semibold tabular-nums", amountTone)}>
          {getSignedAmount(transaction.amount)}
        </p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{directionLabel}</p>
      </div>
    </li>
  );
}