import { ReaderProgress } from "@/components/reader/ReaderProgress";
import { cn } from "@/lib/utils";

type ReaderControlsProps = {
  isVisible: boolean;
  isReady: boolean;
  progressPercentage: number | null;
  onPrev: () => void;
  onNext: () => void;
};

export function ReaderControls({
  isVisible,
  isReady,
  progressPercentage,
  onPrev,
  onNext,
}: ReaderControlsProps) {
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 transition-all duration-200 md:hidden",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        )}
      >
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-2 py-2 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={onPrev}
            disabled={!isReady}
            className="inline-flex h-10 min-w-20 select-none items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Prev
          </button>

          <ReaderProgress progressPercentage={progressPercentage} />

          <button
            type="button"
            onClick={onNext}
            disabled={!isReady}
            className="inline-flex h-10 min-w-20 select-none items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Next
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30 hidden md:block">
        <button
          type="button"
          onClick={onPrev}
          disabled={!isReady}
          className={cn(
            "absolute left-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 select-none items-center justify-center rounded-full border border-slate-200 bg-white/90 text-lg font-semibold text-slate-700 shadow-sm backdrop-blur transition-all md:cursor-pointer",
            isVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            "hover:bg-white disabled:cursor-not-allowed disabled:opacity-40",
          )}
          aria-label="Previous page"
        >
          &#8249;
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!isReady}
          className={cn(
            "absolute right-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 select-none items-center justify-center rounded-full border border-slate-200 bg-white/90 text-lg font-semibold text-slate-700 shadow-sm backdrop-blur transition-all md:cursor-pointer",
            isVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            "hover:bg-white disabled:cursor-not-allowed disabled:opacity-40",
          )}
          aria-label="Next page"
        >
          &#8250;
        </button>

        <ReaderProgress
          progressPercentage={progressPercentage}
          className={cn(
            "absolute bottom-5 left-1/2 -translate-x-1/2 transition-all duration-200",
            isVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      </div>
    </>
  );
}
