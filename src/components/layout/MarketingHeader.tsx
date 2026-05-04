import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { APP_TITLE, ROUTES } from "@/lib/constants";
import { MARKETING_NAVIGATION } from "@/lib/navigation";

export function MarketingHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href={ROUTES.home} className="text-lg font-semibold tracking-tight text-slate-900">
          {APP_TITLE}
        </Link>
        <nav className="flex items-center gap-2">
          {MARKETING_NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={buttonClassNames({
                variant: item.label === "Register" ? "primary" : "secondary",
                size: "sm",
              })}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
