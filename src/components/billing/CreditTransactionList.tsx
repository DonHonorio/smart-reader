import { Card } from "@/components/ui/Card";
import type { CreditTransaction } from "@/types";
import { CreditTransactionItem } from "./CreditTransactionItem";

type CreditTransactionListProps = {
  transactions: CreditTransaction[];
};

export function CreditTransactionList({ transactions }: CreditTransactionListProps) {
  return (
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Credit history</h2>
      </div>

      {transactions.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-600 sm:px-6">No credit activity yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 px-4 sm:px-6">
          {transactions.map((transaction) => (
            <CreditTransactionItem key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}
    </Card>
  );
}