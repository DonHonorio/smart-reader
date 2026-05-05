"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClassNames } from "@/components/ui/Button";
import { APP_TITLE, ROUTES } from "@/lib/constants";
import {
  getAppSectionName,
  isPrivateNavigationItemActive,
  PRIVATE_NAVIGATION,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const pathname = usePathname() ?? "";
  const sectionName = getAppSectionName(pathname);

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-8">
        <div className="flex items-center justify-between gap-3 md:hidden">
          <Link href={ROUTES.home} className="text-lg font-semibold tracking-tight text-slate-900">
            {APP_TITLE}
          </Link>
          <Link
            href={ROUTES.library}
            className={buttonClassNames({ variant: "secondary", size: "sm" })}
          >
            Upload book
          </Link>
        </div>

        <div className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Private workspace
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{sectionName}</h1>
          </div>
          <Link href={ROUTES.library} className={buttonClassNames({ variant: "secondary" })}>
            Upload book
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white md:hidden">
        <ul className="mx-auto grid w-full max-w-screen-sm grid-cols-4 gap-1 px-2 py-2">
          {PRIVATE_NAVIGATION.map((item) => {
            const isActive = isPrivateNavigationItemActive(pathname, item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-md px-2 text-center text-[11px] font-medium leading-4",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
