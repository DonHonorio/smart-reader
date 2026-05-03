import type { ReactNode } from "react";

type PageSectionProps = {
  children: ReactNode;
};

export function PageSection({ children }: PageSectionProps) {
  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
      {children}
    </section>
  );
}
