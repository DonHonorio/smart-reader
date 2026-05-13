import { ContinueReadingCard } from "@/components/dashboard/ContinueReadingCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { StatCard } from "@/components/dashboard/StatCard";
import { ROUTES } from "@/lib/constants";
import { getDashboardData } from "@/lib/dashboard";

export default async function DashboardPage() {
  const dashboardData = await getDashboardData();
  const creditsBalance = dashboardData?.creditsBalance ?? 0;
  const booksCount = dashboardData?.booksCount ?? 0;
  const vocabularyCount = dashboardData?.vocabularyCount ?? 0;
  const latestBook = dashboardData?.latestBook ?? null;
  const latestReadingProgress = dashboardData?.latestReadingProgress ?? null;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Track your progress, review your stats, and continue reading in one place.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Credits"
          value={creditsBalance}
          description="Available credits for new book uploads."
          href={ROUTES.billing}
        />
        <StatCard
          title="Books"
          value={booksCount}
          description="Books in your personal reading library."
          href={ROUTES.library}
        />
        <StatCard
          title="Saved vocabulary"
          value={vocabularyCount}
          description="Terms and phrases captured while reading."
          href={ROUTES.vocabulary}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ContinueReadingCard
          latestBook={latestBook}
          latestReadingProgress={latestReadingProgress}
        />
        <QuickActions />
      </div>
    </section>
  );
}
