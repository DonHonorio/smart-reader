import Link from "next/link";
import { BookCard } from "@/components/books/BookCard";
import { EmptyLibraryState } from "@/components/books/EmptyLibraryState";
import { LibrarySummary } from "@/components/books/LibrarySummary";
import { UploadBookButton } from "@/components/books/UploadBookButton";
import { UploadBookForm } from "@/components/books/UploadBookForm";
import { buttonClassNames } from "@/components/ui/Button";
import { getUserBooksWithProgress } from "@/lib/books";
import { ROUTES } from "@/lib/constants";
import { getUserCredits } from "@/lib/credits";

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

export default async function LibraryPage() {
  const [books, credits] = await Promise.all([getUserBooksWithProgress(), getUserCredits()]);
  const creditsBalance = credits ?? 0;
  const hasBooks = books.length > 0;
  const inProgressCount = books.filter((book) => {
    const progress = normalizeProgressPercentage(book.progress_percentage);
    return progress > 0 && progress < 95;
  }).length;
  const completedCount = books.filter((book) => {
    const progress = normalizeProgressPercentage(book.progress_percentage);
    return progress >= 95;
  }).length;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Library</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Your uploaded books and reading sessions in one place.
        </p>
      </header>

      <LibrarySummary
        creditsBalance={creditsBalance}
        booksCount={books.length}
        inProgressCount={inProgressCount}
        completedCount={completedCount}
      />

      {creditsBalance === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 sm:px-6">
          <p className="font-medium">You have no credits available.</p>
          <p className="mt-1">Buy credits to upload your next book.</p>
          <Link
            href={ROUTES.billing}
            className={buttonClassNames({ variant: "secondary", size: "sm", className: "mt-3" })}
          >
            Go to billing
          </Link>
        </div>
      )}

      <div id="upload-book-panel">
        <UploadBookButton initiallyOpen={!hasBooks} creditsBalance={creditsBalance}>
          <UploadBookForm creditsBalance={creditsBalance} />
        </UploadBookButton>
      </div>

      {!hasBooks ? (
        <EmptyLibraryState uploadHref="#upload-book-panel" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </section>
  );
}
