import Link from "next/link";
import { PageSection } from "@/components/layout/page-section";
import { cn } from "@/lib/utils";
import type { NavigationItem } from "@/types";

type PlaceholderPageProps = {
  label: string;
  title: string;
  description: string;
  links?: NavigationItem[];
};

export function PlaceholderPage({
  label,
  title,
  description,
  links = [],
}: PlaceholderPageProps) {
  return (
    <div className="flex min-h-screen flex-1 bg-slate-50 px-6 py-12 text-slate-900 sm:px-10">
      <PageSection>
        <div className="space-y-6">
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {label}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            {description}
          </p>
          <div className={cn("flex flex-wrap gap-3", links.length === 0 && "hidden")}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </PageSection>
    </div>
  );
}
