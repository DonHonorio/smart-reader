"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { cn } from "@/lib/utils";
import type { UserOnboarding } from "@/types";

type AppShellProps = {
  children: ReactNode;
  creditsBalance?: number | null;
  initialOnboarding?: UserOnboarding | null;
};

export function AppShell({
  children,
  creditsBalance = null,
  initialOnboarding = null,
}: AppShellProps) {
  const pathname = usePathname() ?? "";
  const isReaderRoute =
    pathname.startsWith("/reader/") || pathname.startsWith("/onboarding/reader");

  return (
    <div className="h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <div className="flex h-full min-h-0">
        {!isReaderRoute && <AppSidebar />}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
          {!isReaderRoute && <AppHeader creditsBalance={creditsBalance} />}
          <main
            className={cn(
              "flex-1 min-h-0",
              isReaderRoute
                ? "overflow-hidden bg-[#f6efe3] p-0"
                : "overflow-y-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-6",
            )}
          >
            {children}
          </main>
        </div>
      </div>
      <OnboardingOverlay initialOnboarding={initialOnboarding} />
    </div>
  );
}
