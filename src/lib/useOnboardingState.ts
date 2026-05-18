"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants";

type OnboardingActionType =
  | "theme_changed"
  | "font_size_changed"
  | "text_selected"
  | "translation_shown"
  | "vocabulary_saved"
  | "export_triggered";

type DemoVocabularyItem = {
  selectedText: string;
  term: string;
  translation: string;
  contextSentence: string;
};

type OnboardingState = {
  currentStep: number;
  completedActions: Set<OnboardingActionType>;
  demoVocabulary: DemoVocabularyItem[];
  currentTheme: "light" | "dark" | "sepia";
  currentFontSize: number;
};

const STEP_DEFINITIONS = {
  1: { title: "Welcome to Smart-Reader", action: null as OnboardingActionType | null },
  2: { title: "Library", action: null },
  3: { title: "Reader intro", action: null },
  4: { title: "Change reading theme", action: "theme_changed" },
  5: { title: "Adjust text size", action: "font_size_changed" },
  6: { title: "Select text", action: "text_selected" },
  7: { title: "See translation", action: "translation_shown" },
  8: { title: "Save to vocabulary", action: "vocabulary_saved" },
  9: { title: "View your vocabulary", action: null },
  10: { title: "Export for Anki", action: "export_triggered" },
  11: { title: "You're all set!", action: null },
} as const;

export function useOnboardingState(initialStep: number) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(() => ({
    currentStep: initialStep,
    completedActions: new Set(),
    demoVocabulary: [],
    currentTheme: "light",
    currentFontSize: 100,
  }));

  const totalSteps = useMemo(() => Object.keys(STEP_DEFINITIONS).length, []);

  const stepDef = useMemo(() => {
    const key = state.currentStep as keyof typeof STEP_DEFINITIONS;
    return STEP_DEFINITIONS[key] || { title: "Unknown", action: null };
  }, [state.currentStep]);

  const isActionStep = useMemo(() => stepDef.action !== null, [stepDef.action]);

  const isActionCompleted = useMemo(
    () => stepDef.action && state.completedActions.has(stepDef.action),
    [stepDef.action, state.completedActions],
  );

  const canAdvance = useMemo(
    () => !isActionStep || isActionCompleted,
    [isActionStep, isActionCompleted],
  );

  const recordAction = useCallback(
    (action: OnboardingActionType, payload?: Partial<OnboardingState>) => {
      setState((prev) => ({
        ...prev,
        completedActions: new Set([...prev.completedActions, action]),
        ...(payload || {}),
      }));
    },
    [],
  );

  const advanceStep = useCallback(async () => {
    if (state.currentStep >= totalSteps) {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      router.replace(ROUTES.dashboard);
      router.refresh();
      return;
    }

    setState((prev) => ({
      ...prev,
      currentStep: prev.currentStep + 1,
      completedActions: new Set(),
    }));

    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_step", step: state.currentStep + 1 }),
    });
  }, [state.currentStep, totalSteps, router]);

  const goBack = useCallback(async () => {
    if (state.currentStep <= 1) return;

    setState((prev) => ({
      ...prev,
      currentStep: prev.currentStep - 1,
      completedActions: new Set(),
    }));

    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_step", step: state.currentStep - 1 }),
    });
  }, [state.currentStep]);

  const skip = useCallback(async () => {
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    });
    router.replace(ROUTES.dashboard);
    router.refresh();
  }, [router]);

  const addDemoVocabulary = useCallback((item: DemoVocabularyItem) => {
    setState((prev) => ({
      ...prev,
      demoVocabulary: [...prev.demoVocabulary, item],
    }));
  }, []);

  const updateTheme = useCallback((theme: "light" | "dark" | "sepia") => {
    setState((prev) => ({ ...prev, currentTheme: theme }));
  }, []);

  const updateFontSize = useCallback((size: number) => {
    setState((prev) => ({ ...prev, currentFontSize: size }));
  }, []);

  return {
    state,
    totalSteps,
    stepDef,
    isActionStep,
    isActionCompleted,
    canAdvance,
    recordAction,
    advanceStep,
    goBack,
    skip,
    addDemoVocabulary,
    updateTheme,
    updateFontSize,
  };
}
