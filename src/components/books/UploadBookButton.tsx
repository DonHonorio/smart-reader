"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type UploadBookButtonProps = {
  children: ReactNode;
  initiallyOpen?: boolean;
  creditsBalance: number;
};

export function UploadBookButton({
  children,
  initiallyOpen = false,
  creditsBalance,
}: UploadBookButtonProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const normalizedCredits = Math.max(0, creditsBalance);
  const hasCredits = normalizedCredits > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Upload a new EPUB</h2>
          <p className="text-sm text-slate-600">Add a book to your personal library.</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            Credits: {normalizedCredits}
          </p>
          <Button variant="secondary" onClick={() => setIsOpen((current) => !current)}>
            {isOpen ? "Hide form" : "Upload book"}
          </Button>
        </div>
      </div>

      {!hasCredits && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You need credits to upload more books.
        </p>
      )}

      <div className={cn("mt-4", !isOpen && "hidden")}>{children}</div>
    </section>
  );
}
