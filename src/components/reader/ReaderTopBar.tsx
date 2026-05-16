import { cn } from "@/lib/utils";
import { ReaderProgress } from "@/components/reader/ReaderProgress";

type ReaderTopBarProps = {
  title: string;
  author: string;
  isVisible: boolean;
  progressPercentage: number | null;
  onBack: () => void;
  onOpenSettings: () => void;
};

export function ReaderTopBar({
  title,
  author,
  isVisible,
  progressPercentage,
  onBack,
  onOpenSettings,
}: ReaderTopBarProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.45rem)] transition-all duration-200 md:absolute md:px-5 md:pt-3",
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
      )}
      aria-hidden={!isVisible}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-2 shadow-sm backdrop-blur",
          isVisible ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 select-none items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 md:cursor-pointer"
        >
          Library
        </button>

        <div className="min-w-0 flex-1 select-none">
          <p className="truncate text-sm font-semibold tracking-tight text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-600">{author}</p>
        </div>

        <ReaderProgress progressPercentage={progressPercentage} compact className="hidden sm:inline-flex" />

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-9 select-none items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 md:cursor-pointer"
          aria-label="Open reader settings"
        >
          Aa
        </button>
      </div>
    </div>
  );
}
