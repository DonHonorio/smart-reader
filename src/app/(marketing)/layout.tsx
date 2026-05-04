import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/layout/MarketingHeader";

type MarketingLayoutProps = {
  children: ReactNode;
};

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
        {children}
      </main>
    </div>
  );
}
