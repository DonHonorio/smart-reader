import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@/lib/constants";

const QUICK_ACTIONS = [
  {
    title: "Upload book",
    description: "Add a new EPUB and start reading.",
    href: ROUTES.library,
  },
  {
    title: "View vocabulary",
    description: "Review saved terms and context.",
    href: ROUTES.vocabulary,
  },
  {
    title: "Export Anki CSV",
    description: "Download your cards for Anki import.",
    href: ROUTES.export,
  },
  {
    title: "Buy credits",
    description: "Top up credits for more uploads.",
    href: ROUTES.billing,
  },
];

export function QuickActions() {
  return (
    <Card
      title="Next steps"
      description="Jump directly into the core Smart-Reader workflows."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
          >
            <p className="text-sm font-semibold text-slate-900">{action.title}</p>
            <p className="mt-1 text-sm text-slate-600">{action.description}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}