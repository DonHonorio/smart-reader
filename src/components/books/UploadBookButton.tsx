"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button, buttonClassNames } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants";
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

  function handleToggleUpload() {
    setIsOpen((current) => !current);
    window.dispatchEvent(new Event("onboarding-upload-book-clicked"));
  }

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
          <Button id="library-upload-book-toggle" variant="secondary" onClick={handleToggleUpload}>
            {isOpen ? "Hide form" : "Upload book"}
          </Button>
        </div>
      </div>

      {!hasCredits && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <p>You need 1 credit to upload a book.</p>
          <Link
            href={ROUTES.billing}
            className={buttonClassNames({ variant: "secondary", size: "sm", className: "mt-3" })}
          >
            Buy credits
          </Link>
        </div>
      )}

      <div className={cn("mt-4", !isOpen && "hidden")}>{children}</div>
    </section>
  );
}
