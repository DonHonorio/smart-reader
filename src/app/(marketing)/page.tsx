import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { APP_TAGLINE, APP_TITLE, ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

const LANDING_BENEFITS = [
  "Read your own EPUB books in a focused reader.",
  "Translate words and phrases in context.",
  "Save vocabulary with context sentences in one click.",
  "Export CSV cards ready for Anki review.",
  "No subscription. Buy credits only when you need uploads.",
] as const;

const HOW_IT_WORKS_STEPS = [
  {
    title: "1. Upload your EPUB",
    description: "Add a book from your device and open it in your private library.",
  },
  {
    title: "2. Read and capture vocabulary",
    description:
      "Select text while reading to get contextual translation and save useful expressions.",
  },
  {
    title: "3. Export to Anki",
    description: "Download your vocabulary as CSV and import it into your Anki deck.",
  },
] as const;

export default async function MarketingHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(ROUTES.dashboard);
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6 sm:p-8">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Built for language learners
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {APP_TITLE}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            {APP_TAGLINE} Learn from real content by reading naturally, translating in context,
            and turning useful expressions into review cards. Pay only for credits, with no
            monthly subscription.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={ROUTES.register} className={buttonClassNames()}>
              Create account
            </Link>
            <Link href={ROUTES.login} className={buttonClassNames({ variant: "secondary" })}>
              Login
            </Link>
          </div>
        </Card>

        <Card
          title="Why Smart-Reader"
          description="Focus on the shortest path from reading to spaced repetition."
          className="h-full"
        >
          <ul className="space-y-2 text-sm text-slate-700">
            {LANDING_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2">
                <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900" aria-hidden />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="How it works" description="A simple flow to build vocabulary from real books.">
        <div className="grid gap-3 sm:grid-cols-3">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <article key={step.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
