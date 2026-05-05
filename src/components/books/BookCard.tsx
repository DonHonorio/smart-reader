import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@/lib/constants";
import type { Book } from "@/types";

type BookCardProps = {
  book: Book;
};

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

  return (
    <Card
      className="h-full"
      title={book.title}
      description={author}
      footer={
        <Link
          href={ROUTES.reader(book.id)}
          className={buttonClassNames({ variant: "secondary", size: "sm" })}
        >
          Open reader
        </Link>
      }
    >
      <dl className="space-y-3 text-sm text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <dt>Languages</dt>
          <dd className="font-medium text-slate-700">
            {book.language_from} -&gt; {book.language_to}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Status</dt>
          <dd className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {statusLabel}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Created</dt>
          <dd className="font-medium text-slate-700">{formatCreatedAt(book.created_at)}</dd>
        </div>
      </dl>
    </Card>
  );
}
