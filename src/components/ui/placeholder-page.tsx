import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { NavigationItem } from "@/types";

type PlaceholderPageProps = {
  label: string;
  title: string;
  description: string;
  links?: NavigationItem[];
  children?: ReactNode;
};

export function PlaceholderPage({
  label,
  title,
  description,
  links = [],
  children,
}: PlaceholderPageProps) {
  const hasActions = links.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-3">
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{description}</p>
      </div>

      <Card
        title="Useful links"
        description="Use these links to navigate Smart-Reader."
        className={cn(!hasActions && !children && "hidden")}
      >
        <div className={cn("flex flex-wrap gap-3", !hasActions && "hidden")}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={buttonClassNames({ variant: "secondary", size: "sm" })}
            >
              {link.label}
            </Link>
          ))}
        </div>
        {children && <div className={cn(hasActions && "mt-6")}>{children}</div>}
      </Card>
    </div>
  );
}
