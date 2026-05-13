import Link from "next/link";
import { BookProgressBadge } from "@/components/books/BookProgressBadge";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@/lib/constants";
import type { BookWithProgress } from "@/types";

type BookCardProps = {
  book: BookWithProgress;
};

function normalizeProgressPercentage(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}

function formatStatusLabel(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "processing";
  }

  return normalized.replaceAll("_", " ");
}

function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BookCard({ book }: BookCardProps) {
  const author = book.author?.trim() ? book.author : "Unknown author";
  const statusLabel = book.file_path ? book.status : "processing";
  const normalizedProgress = normalizeProgressPercentage(book.progress_percentage);
  const primaryActionLabel = normalizedProgress > 0 ? "Continue reading" : "Start reading";

  return (
    <Card
      className="h-full"
      footer={
        <Link
          href={ROUTES.reader(book.id)}
          className={buttonClassNames({ variant: "secondary", size: "sm" })}
        >
          {primaryActionLabel}
        </Link>
      }
    >
      <div className="space-y-1">
        <h2 className="line-clamp-2 max-w-full wrap-break-word text-xl font-semibold tracking-tight text-slate-900">
          {book.title}
        </h2>
        <p className="truncate text-sm leading-6 text-slate-600">{author}</p>
      </div>

      <dl className="mt-6 space-y-3 text-sm text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <dt>Languages</dt>
          <dd className="font-medium text-slate-700">
            {book.language_from} -&gt; {book.language_to}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Status</dt>
          <dd className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {formatStatusLabel(statusLabel)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Progress</dt>
          <dd>
            <BookProgressBadge progressPercentage={book.progress_percentage} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Uploaded</dt>
          <dd className="font-medium text-slate-700">{formatCreatedAt(book.created_at)}</dd>
        </div>
      </dl>
    </Card>
  );
}
