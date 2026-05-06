import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <div className="flex h-full min-h-0">
        <AppSidebar />
        <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
