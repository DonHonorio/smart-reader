import { Card } from "@/components/ui/Card";

type CreditBalanceCardProps = {
  balance: number;
};

export function CreditBalanceCard({ balance }: CreditBalanceCardProps) {
  const normalizedBalance = Number.isFinite(balance) ? Math.max(0, balance) : 0;

  return (
    <Card>
      <p className="text-sm font-medium text-slate-600">Current credits</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{normalizedBalance}</p>
      <p className="mt-2 text-sm text-slate-600">1 credit = 1 uploaded book</p>
    </Card>
  );
}