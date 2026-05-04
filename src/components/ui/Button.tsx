import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonClassNamesProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-slate-900 bg-slate-900 text-white hover:border-slate-700 hover:bg-slate-700",
  secondary:
    "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5",
  md: "h-10 px-4",
};

export function buttonClassNames({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassNamesProps = {}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassNames({ variant, size, className })}
      {...props}
    />
  );
}
