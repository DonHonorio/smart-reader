import { cn } from "@/lib/utils";
import type { ReaderTheme } from "@/types";

type ReaderSettingsPanelProps = {
  isOpen: boolean;
  theme: ReaderTheme;
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  canClose?: boolean;
  canThemeChange?: boolean;
  canFontSizeChange?: boolean;
  onClose: () => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
};

const THEME_OPTIONS: Array<{ value: ReaderTheme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
];

export function ReaderSettingsPanel({
  isOpen,
  theme,
  fontSize,
  minFontSize,
  maxFontSize,
  canClose = true,
  canThemeChange = true,
  canFontSizeChange = true,
  onClose,
  onThemeChange,
  onDecreaseFontSize,
  onIncreaseFontSize,
}: ReaderSettingsPanelProps) {
  return (
    <>
      <div
        className={cn(
          "absolute inset-0 z-50 bg-slate-950/35 transition-opacity duration-200 md:hidden",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => {
          if (canClose) {
            onClose();
          }
        }}
        aria-hidden={!isOpen}
      />

      <section
        className={cn(
          "absolute inset-x-0 bottom-0 z-50 rounded-t-3xl border border-slate-200 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl transition-transform duration-200 md:hidden",
          isOpen ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Reading settings</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => {
                const isActive = option.value === theme;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onThemeChange(option.value)}
                    disabled={!canThemeChange}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Text size</p>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
              <button
                type="button"
                onClick={onDecreaseFontSize}
                disabled={!canFontSizeChange || fontSize <= minFontSize}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-lg text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Decrease text size"
              >
                -
              </button>
              <span className="text-sm font-semibold text-slate-800">{fontSize}%</span>
              <button
                type="button"
                onClick={onIncreaseFontSize}
                disabled={!canFontSizeChange || fontSize >= maxFontSize}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-lg text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Increase text size"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        className={cn(
          "absolute right-5 top-16 z-50 hidden w-80 select-none rounded-2xl border border-slate-200 bg-white p-4 shadow-lg transition-all duration-200 md:block",
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
        )}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">Reading settings</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => {
                const isActive = option.value === theme;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onThemeChange(option.value)}
                    disabled={!canThemeChange}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Text size</p>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
              <button
                type="button"
                onClick={onDecreaseFontSize}
                disabled={!canFontSizeChange || fontSize <= minFontSize}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-lg text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Decrease text size"
              >
                -
              </button>
              <span className="text-sm font-semibold text-slate-800">{fontSize}%</span>
              <button
                type="button"
                onClick={onIncreaseFontSize}
                disabled={!canFontSizeChange || fontSize >= maxFontSize}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-lg text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Increase text size"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
