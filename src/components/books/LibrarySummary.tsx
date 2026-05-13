import { Card } from "@/components/ui/Card";

type LibrarySummaryProps = {
  creditsBalance: number;
  booksCount: number;
  inProgressCount: number;
  completedCount?: number;
};

type SummaryMetricProps = {
  label: string;
  value: number;
};

function normalizeNumber(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function SummaryMetric({ label, value }: SummaryMetricProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

export function LibrarySummary({
  creditsBalance,
  booksCount,
  inProgressCount,
  completedCount,
}: LibrarySummaryProps) {
  const normalizedCreditsBalance = normalizeNumber(creditsBalance);
  const normalizedBooksCount = normalizeNumber(booksCount);
  const normalizedInProgressCount = normalizeNumber(inProgressCount);
  const normalizedCompletedCount =
    typeof completedCount === "number" ? normalizeNumber(completedCount) : null;

  return (
    <Card className="space-y-4 p-4 sm:p-6" title="Library overview">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SummaryMetric label="Books" value={normalizedBooksCount} />
        <SummaryMetric label="Credits" value={normalizedCreditsBalance} />
        <SummaryMetric label="In progress" value={normalizedInProgressCount} />
        {normalizedCompletedCount !== null && (
          <SummaryMetric label="Completed" value={normalizedCompletedCount} />
        )}
      </div>
      <p className="text-sm text-slate-600">Uploading a new book uses 1 credit.</p>
    </Card>
  );
}
