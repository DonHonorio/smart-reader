"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OnboardingDemoReader } from "@/components/onboarding/OnboardingDemoReader";
import { OnboardingSpotlight } from "@/components/onboarding/OnboardingSpotlight";
import { OnboardingStepCard } from "@/components/onboarding/OnboardingStepCard";
import { OnboardingVocabularyView } from "@/components/onboarding/OnboardingVocabularyView";
import type { OnboardingSpotlightConfig } from "@/components/onboarding/OnboardingSpotlight";
import { ROUTES } from "@/lib/constants";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius?: number;
};

type OnboardingTourProps = {
  initialStep: number;
};

const TOTAL_STEPS = 12;

const STEP_CONFIGS: Record<
  number,
  {
    title: string;
    description: string;
    nextLabel?: string;
    expectedPath: string;
    expectedHref?: string;
    showDemoReader?: boolean;
    getHighlighted?: () => string[] | null;
  }
> = {
  1: {
    title: "Welcome to Smart-Reader",
    description: "You have 1 free credit. This quick tutorial will not use it.",
    expectedPath: ROUTES.dashboard,
    nextLabel: "Start tutorial",
  },
  2: {
    title: "Your Library",
    description: "Upload EPUB books here. Each real book uses 1 credit.",
    expectedPath: ROUTES.library,
    nextLabel: "Let's practice",
    getHighlighted: () => ["#upload-book-panel"],
  },
  3: {
    title: "Open Reading Settings",
    description: "Tap or click the 'Aa' settings icon to open reading preferences like theme and text size.",
    expectedPath: ROUTES.onboardingReader,
    showDemoReader: true,
    getHighlighted: () => null,
  },
  4: {
    title: "Change Reading Theme",
    description: "Press a theme option to change contrast and background style for more comfortable reading.",
    expectedPath: ROUTES.onboardingReader,
    showDemoReader: true,
    nextLabel: "Next",
    getHighlighted: () => null,
  },
  5: {
    title: "Text Size Control",
    description: "Adjust text size with +/- until it feels comfortable, then press Next to continue.",
    expectedPath: ROUTES.onboardingReader,
    showDemoReader: true,
    getHighlighted: () => null,
  },
  6: {
    title: "Navigate Pages",
    description: "Press the Next page button to move forward through the chapter while reading.",
    expectedPath: ROUTES.onboardingReader,
    showDemoReader: true,
    getHighlighted: () => null,
  },
  7: {
    title: "Select Text",
    description: "Select the word 'weather' to see its contextual meaning and translate it in the sentence where it appears.",
    expectedPath: ROUTES.onboardingReader,
    showDemoReader: true,
    getHighlighted: () => null,
  },
  8: {
    title: "See Translation",
    description: "Press Save to add this word and sentence to your vocabulary list for later review.",
    expectedPath: ROUTES.onboardingReader,
    showDemoReader: true,
    getHighlighted: () => null,
  },
  9: {
    title: "Your Vocabulary",
    description: "Press Continue to go to Export, where you'll download your vocabulary CSV for Anki.",
    expectedPath: ROUTES.vocabulary,
    nextLabel: "Continue",
  },
  10: {
    title: "Export for Anki",
    description: "Press the Export CSV button to download your vocabulary and import it into Anki.",
    expectedPath: ROUTES.export,
    getHighlighted: () => ["#export-anki-button"],
  },
  11: {
    title: "Upload your first book",
    description: "Press Upload book to open the form and add your first real EPUB file.",
    expectedPath: ROUTES.library,
    expectedHref: `${ROUTES.library}?onboardingUpload=closed`,
    getHighlighted: () => ["#library-upload-book-toggle"],
  },
  12: {
    title: "You're Ready!",
    description: "Press Finish to close the tutorial and start reading with your own library.",
    expectedPath: ROUTES.library,
    nextLabel: "Finish",
  },
};

function clampStep(step: number) {
  if (!Number.isFinite(step)) {
    return 1;
  }

  return Math.min(TOTAL_STEPS, Math.max(1, Math.trunc(step)));
}

function getSpotlightRectsForStep(
  step: number,
  selectors: string[] | null,
): SpotlightRect[] | null {
  if (!selectors) {
    return null;
  }

  const rects: SpotlightRect[] = [];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    const padding = 8;

    rects.push({
      top: Math.max(0, rect.top - padding),
      left: Math.max(0, rect.left - padding),
      width: Math.max(0, rect.width + padding * 2),
      height: Math.max(0, rect.height + padding * 2),
      borderRadius: 12,
    });
  }

  return rects.length > 0 ? rects : null;
}

async function postOnboardingAction(payload: {
  action: "skip" | "complete" | "set_step";
  step?: number;
}) {
  await fetch("/api/onboarding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function cleanupOnboardingDemoBook() {
  const response = await fetch("/api/onboarding/cleanup-demo", {
    method: "POST",
  });

  return response.ok;
}

export function OnboardingTour({ initialStep }: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(clampStep(initialStep));
  const [isBusy, setIsBusy] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [highlightedRects, setHighlightedRects] = useState<SpotlightRect[] | null>(null);

  const stepConfig = useMemo(() => STEP_CONFIGS[currentStep] || {}, [currentStep]);

  const routePath = stepConfig.expectedPath || ROUTES.dashboard;
  const routeHref = stepConfig.expectedHref || routePath;
  const onboardingUploadParam = searchParams.get("onboardingUpload");

  useEffect(() => {
    const shouldReplacePath = !pathname.startsWith(routePath);
    const shouldForceStep11Query =
      currentStep === 11 && pathname.startsWith(ROUTES.library) && onboardingUploadParam !== "closed";

    if (shouldReplacePath || shouldForceStep11Query) {
      router.replace(routeHref);
    }
  }, [currentStep, onboardingUploadParam, pathname, routeHref, routePath, router]);

  useEffect(() => {
    const updateHighlights = () => {
      const selectors = stepConfig.getHighlighted?.() ?? null;
      const rects = getSpotlightRectsForStep(currentStep, selectors);
      setHighlightedRects(rects);
    };

    updateHighlights();
    const timer = window.setTimeout(updateHighlights, 120);
    window.addEventListener("resize", updateHighlights);
    window.addEventListener("scroll", updateHighlights, true);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateHighlights);
      window.removeEventListener("scroll", updateHighlights, true);
    };
  }, [currentStep, pathname, stepConfig]);

  useEffect(() => {
    void postOnboardingAction({ action: "set_step", step: currentStep });
  }, [currentStep]);

  useEffect(() => {
    const lockClassName = "onboarding-lock-vocabulary-filters";

    if (currentStep === 9) {
      document.body.classList.add(lockClassName);
    } else {
      document.body.classList.remove(lockClassName);
    }

    return () => {
      document.body.classList.remove(lockClassName);
    };
  }, [currentStep]);

  useEffect(() => {
    const lockClassName = "onboarding-lock-upload-panel-step-2";

    if (currentStep === 2) {
      document.body.classList.add(lockClassName);
    } else {
      document.body.classList.remove(lockClassName);
    }

    return () => {
      document.body.classList.remove(lockClassName);
    };
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 10) {
      return;
    }

    const handleExportClicked = () => {
      setCurrentStep((prev) => clampStep(prev + 1));
    };

    window.addEventListener("onboarding-export-clicked", handleExportClicked);

    return () => {
      window.removeEventListener("onboarding-export-clicked", handleExportClicked);
    };
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 11) {
      return;
    }

    const scrollToUploadButton = () => {
      if (!window.matchMedia("(max-width: 639px)").matches) {
        return;
      }

      const uploadButton = document.querySelector("#library-upload-book-toggle");
      if (!uploadButton) {
        return;
      }

      uploadButton.scrollIntoView({
        behavior: "auto",
        block: "center",
      });

      // Recompute spotlight after programmatic scroll to keep interaction hole aligned.
      window.dispatchEvent(new Event("scroll"));
    };

    const timer = window.setTimeout(scrollToUploadButton, 180);
    const handleUploadBookClicked = () => {
      setCurrentStep((prev) => clampStep(prev + 1));
    };

    window.addEventListener("onboarding-upload-book-clicked", handleUploadBookClicked);
    window.addEventListener("resize", scrollToUploadButton);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("onboarding-upload-book-clicked", handleUploadBookClicked);
      window.removeEventListener("resize", scrollToUploadButton);
    };
  }, [currentStep, pathname]);

  const expectedActionByStep = useMemo<Record<number, string>>(
    () => ({
      3: "open_settings",
      6: "next_page",
      7: "select_weather",
      8: "save_vocabulary",
    }),
    [],
  );

  const advanceToNextStep = useCallback(() => {
    setCurrentStep((prev) => clampStep(prev + 1));
  }, []);

  const handleDemoAction = useCallback(
    (action: string) => {
      if (isBusy) {
        return;
      }

      const expected = expectedActionByStep[currentStep];
      if (!expected || action !== expected) {
        return;
      }

      window.setTimeout(() => {
        advanceToNextStep();
      }, 300);
    },
    [advanceToNextStep, currentStep, expectedActionByStep, isBusy],
  );

  async function handleSkip() {
    if (isBusy) return;

    setIsBusy(true);

    try {
      await postOnboardingAction({ action: "skip" });
      setIsDismissed(true);
      router.replace(ROUTES.dashboard);
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleNext() {
    if (isBusy || currentStep >= TOTAL_STEPS) return;

    if (currentStep === 9) {
      setIsBusy(true);

      try {
        const cleaned = await cleanupOnboardingDemoBook();

        if (!cleaned) {
          alert("We could not remove the tutorial book right now. Please try again.");
          return;
        }
      } finally {
        setIsBusy(false);
      }
    }

    setCurrentStep((prev) => clampStep(prev + 1));
  }

  function handleBack() {
    if (isBusy || currentStep <= 1) return;

    setCurrentStep((prev) => clampStep(prev - 1));
  }

  async function handleComplete() {
    if (isBusy) return;

    setIsBusy(true);

    try {
      await postOnboardingAction({ action: "complete" });
      setIsDismissed(true);
      router.replace(ROUTES.library + "?upload=open");
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  if (isDismissed) {
    return null;
  }

  const spotlightConfig: OnboardingSpotlightConfig = {
    highlighted: highlightedRects,
    fullDark: currentStep === 1,
  };

  const demoReaderCalls =
    currentStep >= 3 && currentStep <= 8
      ? {
          tutorialStep: currentStep,
          onOpenSettings: () => {
            handleDemoAction("open_settings");
          },
          onFontSizeChange: () => {
            handleDemoAction("font_size_changed");
          },
          onNextPage: () => {
            handleDemoAction("next_page");
          },
          onSelectWeather: () => {
            handleDemoAction("select_weather");
          },
          onSaveVocabulary: () => {
            handleDemoAction("save_vocabulary");
          },
        }
      : {};

  const cardPositionClassName =
    stepConfig.showDemoReader
      ? currentStep === 8
        ? "fixed inset-x-0 top-0 z-130 p-3 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-4 sm:w-full sm:max-w-md"
        : currentStep === 4 || currentStep === 5 || currentStep === 6
        ? "fixed inset-x-0 top-1/2 z-130 -translate-y-1/2 p-3 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-4 sm:translate-y-0 sm:w-full sm:max-w-md"
        : "fixed inset-x-0 bottom-0 z-130 p-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-full sm:max-w-md"
      : currentStep === 9 || currentStep === 10 || currentStep === 11
        ? "fixed inset-x-0 top-0 z-130 p-3 sm:top-4 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2"
      : "fixed inset-x-0 bottom-0 z-130 p-3 sm:bottom-4 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2";

  return (
    <div className="fixed inset-0 z-120 pointer-events-none" aria-live="polite">
      <OnboardingSpotlight {...spotlightConfig} />

      {stepConfig.showDemoReader && (
        <div className="absolute inset-0 z-10 pointer-events-auto">
          <OnboardingDemoReader
            className="h-full w-full rounded-none border-0"
            {...demoReaderCalls}
          />
        </div>
      )}

      <div className={cardPositionClassName + " pointer-events-auto"}>
        <OnboardingStepCard
          title={stepConfig.title}
          description={stepConfig.description}
          step={currentStep}
          totalSteps={TOTAL_STEPS}
          onBack={currentStep > 1 && currentStep !== 10 ? handleBack : undefined}
          onNext={
            currentStep === 3 || currentStep === 6 || currentStep === 7 || currentStep === 8 || currentStep === 10 || currentStep === 11
              ? undefined
              : currentStep < TOTAL_STEPS
                ? handleNext
                : undefined
          }
          nextLabel={stepConfig.nextLabel || "Next"}
          onSkip={handleSkip}
          isBusy={isBusy}
          hideActions={currentStep === 11 || currentStep === 12}
        >
          {currentStep === 9 ? (
            <OnboardingVocabularyView showExportButton={false} />
          ) : null}

          {currentStep === 12 ? (
            <div className="mt-5 flex items-center justify-center">
              <Button
                type="button"
                onClick={handleComplete}
                disabled={isBusy}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                Finish
              </Button>
            </div>
          ) : null}
        </OnboardingStepCard>
      </div>
    </div>
  );
}
