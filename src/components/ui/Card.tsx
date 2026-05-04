import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  footer?: ReactNode;
};

export function Card({
  className,
  title,
  description,
  footer,
  children,
  ...props
}: CardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8",
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <header className="space-y-2">
          {title && <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>}
          {description && <p className="text-sm leading-6 text-slate-600">{description}</p>}
        </header>
      )}
      {children && <div className={cn(title || description ? "mt-6" : undefined)}>{children}</div>}
      {footer && <footer className="mt-6">{footer}</footer>}
    </section>
  );
}
