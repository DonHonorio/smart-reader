import { cn } from "@/lib/utils";

type BookProgressBadgeProps = {
  progressPercentage?: number | null;
  className?: string;
};

function normalizeProgressPercentage(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value);
}

export function BookProgressBadge({ progressPercentage, className }: BookProgressBadgeProps) {
  const normalizedProgress = normalizeProgressPercentage(progressPercentage);

  if (normalizedProgress >= 95) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700",
          className,
        )}
      >
        Completed
      </span>
    );
  }

  if (normalizedProgress > 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700",
          className,
        )}
      >
        {normalizedProgress}% read
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700",
        className,
      )}
    >
      Not started
    </span>
  );
}
