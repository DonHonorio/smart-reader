"use client";

import { cn } from "@/lib/utils";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius?: number;
};

export type OnboardingSpotlightConfig = {
  highlighted?: SpotlightRect[] | null;
  fullDark?: boolean;
  className?: string;
};

export function OnboardingSpotlight({
  highlighted,
  fullDark,
  className,
}: OnboardingSpotlightConfig) {
  if (fullDark) {
    return (
      <div
        className={cn("fixed inset-0 z-120 bg-black/60 pointer-events-auto", className)}
        aria-hidden="true"
      />
    );
  }

  if (!highlighted || highlighted.length === 0) {
    return null;
  }

  if (highlighted.length === 1) {
    const rect = highlighted[0];
    const top = Math.max(0, Math.round(rect.top));
    const left = Math.max(0, Math.round(rect.left));
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    const borderRadius = rect.borderRadius ?? 16;

    return (
      <div className={cn("fixed inset-0 z-120 pointer-events-none", className)} aria-hidden="true">
        <div
          className="absolute left-0 right-0 top-0 bg-black/60 pointer-events-auto"
          style={{ height: top }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/60 pointer-events-auto"
          style={{ top: top + height }}
        />
        <div
          className="absolute bg-black/60 pointer-events-auto"
          style={{ left: 0, top, width: left, height }}
        />
        <div
          className="absolute bg-black/60 pointer-events-auto"
          style={{ left: left + width, right: 0, top, height }}
        />
        <div
          className="pointer-events-none absolute border-2 border-white/80 shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
          style={{ top, left, width, height, borderRadius }}
        />
      </div>
    );
  }

  return (
    <div className={cn("fixed inset-0 z-120 pointer-events-none", className)} aria-hidden="true">
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full pointer-events-auto"
      >
        <defs>
          <mask id="onboarding-spotlight-mask">
            <rect width="1920" height="1080" fill="white" />
            {highlighted.map((rect, idx) => (
              <rect
                key={idx}
                x={Math.max(0, Math.round(rect.left))}
                y={Math.max(0, Math.round(rect.top))}
                width={Math.max(0, Math.round(rect.width))}
                height={Math.max(0, Math.round(rect.height))}
                rx={rect.borderRadius ?? 16}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          width="1920"
          height="1080"
          fill="black"
          opacity="0.6"
          mask="url(#onboarding-spotlight-mask)"
        />
      </svg>
      {highlighted.map((rect, idx) => {
        const top = Math.max(0, Math.round(rect.top));
        const left = Math.max(0, Math.round(rect.left));
        const width = Math.max(0, Math.round(rect.width));
        const height = Math.max(0, Math.round(rect.height));
        const borderRadius = rect.borderRadius ?? 16;

        return (
          <div
            key={idx}
            className="pointer-events-none absolute border-2 border-white/80 shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
            style={{ top, left, width, height, borderRadius }}
          />
        );
      })}
    </div>
  );
}
