"use client";

import { OnboardingTour } from "@/components/onboarding/OnboardingTourV2";
import type { UserOnboarding } from "@/types";

type OnboardingOverlayProps = {
  initialOnboarding: UserOnboarding | null;
};

export function OnboardingOverlay({ initialOnboarding }: OnboardingOverlayProps) {
  if (!initialOnboarding || initialOnboarding.status !== "pending") {
    return null;
  }

  return <OnboardingTour initialStep={initialOnboarding.current_step} />;
}
