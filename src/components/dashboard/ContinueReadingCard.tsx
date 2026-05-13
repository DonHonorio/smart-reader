import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@/lib/constants";
import type { DashboardLatestBook, DashboardLatestReadingProgress } from "@/types";

type ContinueReadingCardProps = {
  latestBook: DashboardLatestBook | null;
  latestReadingProgress: DashboardLatestReadingProgress | null;
};

function normalizeProgressPercentage(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ContinueReadingCard({ latestBook, latestReadingProgress }: ContinueReadingCardProps) {
  if (!latestReadingProgress?.book_id) {
    return (
      <Card
        title="Continue reading"
        description="Resume your learning flow with your next reading session."
        footer={
          <Link
            href={ROUTES.library}
            className={buttonClassNames({ variant: "secondary", size: "sm" })}
          >
            Go to library
          </Link>
        }
      >
        <p className="text-sm text-slate-700">Start reading your first book.</p>
      </Card>
    );
  }

  const progress = normalizeProgressPercentage(latestReadingProgress.progress_percentage);
  const progressLabel = `${progress}%`;
  const bookTitle =
    latestReadingProgress.book_title?.trim() || latestBook?.title?.trim() || "Untitled book";

  return (
    <Card
      title="Continue reading"
      description={`Last progress update: ${formatUpdatedAt(latestReadingProgress.updated_at)}.`}
      footer={
        <Link
          href={ROUTES.reader(latestReadingProgress.book_id)}
          className={buttonClassNames({ variant: "secondary", size: "sm" })}
        >
          Continue reading
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="line-clamp-2 wrap-break-word text-lg font-semibold tracking-tight text-slate-900">
            {bookTitle}
          </p>
          <p className="text-sm text-slate-600">Approximate progress: {progressLabel}</p>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: progressLabel }}
          />
        </div>
      </div>
    </Card>
  );
}