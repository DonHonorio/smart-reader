import { cn } from "@/lib/utils";

type ReaderProgressProps = {
  progressPercentage: number | null;
  compact?: boolean;
  className?: string;
};

function normalizeProgressValue(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function ReaderProgress({ progressPercentage, compact = false, className }: ReaderProgressProps) {
  const normalizedProgress = normalizeProgressValue(progressPercentage);
  const label = normalizedProgress === null ? "--%" : `${normalizedProgress}%`;

  if (compact) {
    return (
      <span
        className={cn(
          "rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700",
          className,
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-24 items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 shadow-sm",
        className,
      )}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-800 transition-[width] duration-300"
          style={{ width: `${normalizedProgress ?? 0}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
    </div>
  );
}
