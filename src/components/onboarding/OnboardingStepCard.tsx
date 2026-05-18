"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type OnboardingStepCardProps = {
  title: string;
  description: string;
  step: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  onSkip: () => void;
  nextLabel?: string;
  backLabel?: string;
  skipLabel?: string;
  isBusy?: boolean;
  hideActions?: boolean;
  className?: string;
  children?: ReactNode;
};

export function OnboardingStepCard({
  title,
  description,
  step,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  nextLabel = "Next",
  backLabel = "Back",
  skipLabel = "Skip tutorial",
  isBusy = false,
  hideActions = false,
  className,
  children,
}: OnboardingStepCardProps) {
  return (
    <section
      className={cn(
        "w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 sm:p-5 animate-in fade-in slide-in-from-bottom-4 duration-300",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tutorial"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Step {step} of {totalSteps}
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

      {children ? <div className="mt-4">{children}</div> : null}

      {hideActions ? null : (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {onBack ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isBusy}
            >
              {backLabel}
            </Button>
          ) : null}

          {onNext ? (
            <Button
              type="button"
              onClick={onNext}
              disabled={isBusy}
              className="ml-auto"
            >
              {nextLabel}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={isBusy}
            className={cn(onNext ? "" : "ml-auto")}
          >
            {skipLabel}
          </Button>
        </div>
      )}
    </section>
  );
}
