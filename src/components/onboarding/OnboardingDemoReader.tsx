"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReaderControls } from "@/components/reader/ReaderControls";
import { ReaderSettingsPanel } from "@/components/reader/ReaderSettingsPanel";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { cn } from "@/lib/utils";
import type { ReaderTheme } from "@/types";

const DEMO_PAGES = [
  "Welcome to Smart-Reader. Read naturally, change the theme, adjust the text size, and move through pages just like in a regular ebook.",
  "I'm feeling a bit under the weather today. Select words or phrases to get a contextual translation and save them for Anki.",
] as const;

const THEME_SURFACE: Record<ReaderTheme, { app: string; text: string; page: string }> = {
  light: {
    app: "bg-[#fffaf5]",
    text: "text-slate-900",
    page: "bg-white",
  },
  sepia: {
    app: "bg-[#f4ecd8]",
    text: "text-[#2f261d]",
    page: "bg-[#f7f0dd]",
  },
  dark: {
    app: "bg-[#181818]",
    text: "text-slate-100",
    page: "bg-[#202020]",
  },
};

function getNormalizedSelectedWord() {
  const rawSelection = window.getSelection()?.toString() ?? "";

  return rawSelection
    .trim()
    .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "")
    .toLowerCase();
}

function isWeatherSelection(rawSelection: string) {
  const words = (rawSelection.toLowerCase().match(/[a-zA-Z]+/g) ?? []).map((word) =>
    word.trim(),
  );

  return words.length === 1 && words[0] === "weather";
}

function clearNativeSelection() {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  selection.removeAllRanges();
}

type OnboardingDemoReaderProps = {
  tutorialStep?: number;
  onOpenSettings?: () => void;
  onFontSizeChange?: (size: number) => void;
  onNextPage?: () => void;
  onSelectWeather?: () => void;
  onSaveVocabulary?: (item: { selectedText: string; term: string; translation: string; contextSentence: string }) => void | Promise<void>;
  className?: string;
};

export function OnboardingDemoReader({
  tutorialStep,
  onOpenSettings,
  onFontSizeChange,
  onNextPage,
  onSelectWeather,
  onSaveVocabulary,
  className,
}: OnboardingDemoReaderProps) {
  const [pageState, setPageState] = useState(0);
  const [theme, setTheme] = useState<ReaderTheme>("light");
  const [fontSize, setFontSize] = useState(100);
  const [settingsOpenState, setSettingsOpenState] = useState(false);
  const [isWeatherSelected, setIsWeatherSelected] = useState(() => tutorialStep === 8);
  const [isSaved, setIsSaved] = useState(false);

  const isStrictMode = typeof tutorialStep === "number";
  const allowOpenSettings = !isStrictMode || tutorialStep === 3;
  const allowThemeChange = !isStrictMode || tutorialStep === 4;
  const allowFontSizeChange = !isStrictMode || tutorialStep === 5;
  const allowPrevPage = !isStrictMode;
  const allowNextPage = !isStrictMode || tutorialStep === 6;
  const allowTextSelection = !isStrictMode || tutorialStep === 7;
  const allowSave = !isStrictMode || tutorialStep === 8;
  const isWeatherSelectedForCurrentStep =
    isStrictMode && tutorialStep === 7 ? false : isWeatherSelected;
  const currentPage =
    isStrictMode && (tutorialStep === 3 || tutorialStep === 6)
      ? 0
      : isStrictMode && (tutorialStep === 7 || tutorialStep === 8)
        ? 1
        : pageState;
  const isSettingsOpen = isStrictMode ? tutorialStep === 4 || tutorialStep === 5 : settingsOpenState;

  const pageText = DEMO_PAGES[currentPage];
  const progress = useMemo(() => ((currentPage + 1) / DEMO_PAGES.length) * 100, [currentPage]);
  const palette = THEME_SURFACE[theme];

  function goNextPage() {
    if (!allowNextPage) {
      return;
    }

    setPageState((prev) => Math.min(prev + 1, DEMO_PAGES.length - 1));
    setIsWeatherSelected(false);
    setIsSaved(false);
    onNextPage?.();
  }

  function goPrevPage() {
    if (!allowPrevPage) {
      return;
    }

    setPageState((prev) => Math.max(prev - 1, 0));
    setIsWeatherSelected(false);
    setIsSaved(false);
  }

  function handleThemeChange(newTheme: ReaderTheme) {
    if (!allowThemeChange) {
      return;
    }

    setTheme(newTheme);
  }

  function increaseFontSize() {
    if (!allowFontSizeChange) {
      return;
    }

    const newSize = Math.min(fontSize + 10, 150);
    setFontSize(newSize);
    onFontSizeChange?.(newSize);
  }

  function decreaseFontSize() {
    if (!allowFontSizeChange) {
      return;
    }

    const newSize = Math.max(fontSize - 10, 80);
    setFontSize(newSize);
    onFontSizeChange?.(newSize);
  }

  const checkWordSelection = useCallback(() => {
    if (!allowTextSelection || currentPage !== 1 || isWeatherSelectedForCurrentStep) {
      return;
    }

    const rawSelection = window.getSelection()?.toString() ?? "";
    const selected = getNormalizedSelectedWord();

    if (selected === "weather" || isWeatherSelection(rawSelection)) {
      setIsWeatherSelected(true);

      if (isStrictMode && tutorialStep === 7) {
        // Keep this only for onboarding step 7: hide native text selection handles.
        window.setTimeout(() => {
          clearNativeSelection();
        }, 0);
      }

      onSelectWeather?.();
    }
  }, [
    allowTextSelection,
    currentPage,
    isStrictMode,
    isWeatherSelectedForCurrentStep,
    onSelectWeather,
    tutorialStep,
  ]);

  useEffect(() => {
    if (!allowTextSelection || currentPage !== 1 || isWeatherSelectedForCurrentStep) {
      return;
    }

    let timeoutId: number | null = null;

    const scheduleSelectionCheck = (delay = 70) => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        checkWordSelection();
      }, delay);
    };

    const onSelectionChange = () => {
      // On mobile, native selection settles slightly after selectionchange.
      scheduleSelectionCheck(70);
    };

    const onSelectionRelease = () => {
      // Extra check after touch/pointer release for mobile Safari/Chrome.
      scheduleSelectionCheck(90);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("touchend", onSelectionRelease, true);
    document.addEventListener("pointerup", onSelectionRelease, true);
    document.addEventListener("mouseup", onSelectionRelease, true);

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("touchend", onSelectionRelease, true);
      document.removeEventListener("pointerup", onSelectionRelease, true);
      document.removeEventListener("mouseup", onSelectionRelease, true);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [allowTextSelection, currentPage, isWeatherSelectedForCurrentStep, checkWordSelection]);

  async function saveDemoSelection() {
    if (!allowSave || !isWeatherSelected) {
      return;
    }
    
    const demoItem = {
      selectedText: "weather",
      term: "under the weather",
      translation: "sentirse mal",
      contextSentence: "I'm feeling a bit under the weather today.",
    };

    try {
      const response = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: "onboarding-demo",
          selectedText: demoItem.selectedText,
          term: demoItem.term,
          canonicalUnit: demoItem.term,
          translation: demoItem.translation,
          contextSentence: demoItem.contextSentence,
          unitType: "idiom",
          confidence: "high",
        }),
      });

      if (!response.ok) {
        alert("Could not save vocabulary");
        return;
      }

      setIsSaved(true);
      await onSaveVocabulary?.(demoItem);
    } catch {
      alert("Could not save vocabulary");
    }
  }

  return (
    <section
      id="onboarding-demo-reader-surface"
      className={cn(
        "relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-slate-200/80 shadow-lg",
        palette.app,
        palette.text,
        className,
      )}
      aria-label="Demo reader"
    >
      <ReaderTopBar
        title="Smart-Reader Demo"
        author="Internal tutorial content"
        isVisible
        progressPercentage={progress}
        canBack={false}
        canOpenSettings={allowOpenSettings}
        onBack={() => undefined}
        onOpenSettings={() => {
          if (!allowOpenSettings) {
            return;
          }

          setSettingsOpenState(true);
          onOpenSettings?.();
        }}
      />

      <div className="h-full overflow-y-auto px-4 pb-24 pt-20 md:px-8 md:pb-20 md:pt-24">
        <article
          className={cn(
            "mx-auto max-w-3xl rounded-2xl border border-slate-200/80 px-6 py-8 leading-9 shadow-sm",
            palette.page,
            theme === "dark" ? "border-slate-700/80" : "",
            allowTextSelection
              ? "select-text selection:bg-fuchsia-200 selection:text-slate-900"
              : "select-none",
          )}
          style={{ fontSize: `${fontSize}%` }}
          onMouseUp={checkWordSelection}
          onTouchEnd={checkWordSelection}
        >
          {currentPage === 1 ? (
            <p>
              I&apos;m feeling a bit under the{" "}
              <span
                className={cn(
                  "rounded px-1 py-0.5 underline decoration-2 underline-offset-2 transition-colors",
                    isWeatherSelectedForCurrentStep ? "font-semibold" : "",
                )}
              >
                weather
              </span>{" "}
              today. Select words or phrases to get a contextual translation and save them for Anki.
            </p>
          ) : (
            <p>{pageText}</p>
          )}
        </article>

        {currentPage === 1 && isWeatherSelectedForCurrentStep ? (
          <aside className="mx-auto mt-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected text</p>
            <p className="mt-1 rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-800">weather</p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Translated expression
            </p>
            <p className="mt-1 rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
              under the weather
            </p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Translation</p>
            <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800">
              sentirse mal
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={saveDemoSelection}
                disabled={!allowSave}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:border-slate-700 hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
              {isSaved ? (
                <p className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                  Saved to your vocabulary
                </p>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <ReaderControls
        isVisible
        isReady
        canPrev={allowPrevPage}
        canNext={allowNextPage}
        progressPercentage={progress}
        onPrev={goPrevPage}
        onNext={goNextPage}
      />

      <ReaderSettingsPanel
        isOpen={isSettingsOpen}
        theme={theme}
        fontSize={fontSize}
        minFontSize={80}
        maxFontSize={150}
        canClose={!isStrictMode}
        canThemeChange={allowThemeChange}
        canFontSizeChange={allowFontSizeChange}
        onClose={() => {
          if (!isStrictMode) {
            setSettingsOpenState(false);
          }
        }}
        onThemeChange={handleThemeChange}
        onDecreaseFontSize={decreaseFontSize}
        onIncreaseFontSize={increaseFontSize}
      />
    </section>
  );
}
