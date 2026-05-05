"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type UploadBookButtonProps = {
  children: ReactNode;
  initiallyOpen?: boolean;
};

export function UploadBookButton({
  children,
  initiallyOpen = false,
}: UploadBookButtonProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Upload a new EPUB</h2>
          <p className="text-sm text-slate-600">Add a book to your personal library.</p>
        </div>
        <Button variant="secondary" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Hide form" : "Upload book"}
        </Button>
      </div>

      <div className={cn("mt-4", !isOpen && "hidden")}>{children}</div>
    </section>
  );
}
