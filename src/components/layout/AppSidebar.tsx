import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { APP_TITLE, ROUTES } from "@/lib/constants";
import { PRIVATE_NAVIGATION } from "@/lib/navigation";

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block md:px-5 md:py-8">
      <Link href={ROUTES.home} className="text-lg font-semibold tracking-tight text-slate-900">
        {APP_TITLE}
      </Link>
      <nav className="mt-8 flex flex-col gap-2">
        {PRIVATE_NAVIGATION.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <form action="/logout" method="post" className="mt-8 border-t border-slate-200 pt-6">
        <Button type="submit" variant="ghost" className="w-full justify-start">
          Logout
        </Button>
      </form>
    </aside>
  );
}
