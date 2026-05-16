import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { EpubReader } from "@/components/reader/EpubReader";
import { getUserBookById, getUserReadingProgressByBookId } from "@/lib/books";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

type ReaderBookPageProps = {
  params: Promise<{
    bookId: string;
  }>;
};

type ReaderFallbackProps = {
  title: string;
  description: string;
  actionLabel: string;
  retryHref?: string;
};

function ReaderFallback({ title, description, actionLabel, retryHref }: ReaderFallbackProps) {
  return (
    <section className="flex h-full min-h-0 w-full items-center justify-center bg-[#f6efe3] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur">
        <h1 className="text-base font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <Link
          href={ROUTES.library}
          className={buttonClassNames({ variant: "secondary", className: "mt-4 w-full" })}
        >
          {actionLabel}
        </Link>
        {retryHref ? (
          <Link
            href={retryHref}
            className={buttonClassNames({ variant: "ghost", className: "mt-2 w-full" })}
          >
            Try again
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default async function ReaderBookPage({ params }: ReaderBookPageProps) {
  const { bookId } = await params;
  const book = await getUserBookById(bookId);

  if (!book) {
    return (
      <ReaderFallback
        title="We could not load this book."
        description="Book not found for your account."
        actionLabel="Back to Library"
      />
    );
  }

  const readingProgress = await getUserReadingProgressByBookId(book.id);

  const author = book.author?.trim() ? book.author : "Unknown author";

  if (!book.file_path) {
    return (
      <ReaderFallback
        title="This book file is missing."
        description="This EPUB entry has no file path yet."
        actionLabel="Back to Library"
      />
    );
  }

  const supabase = await createClient();
  const { data: signedData, error: signedUrlError } = await supabase.storage
    .from("books")
    .createSignedUrl(book.file_path, 60 * 60);

  if (signedUrlError || !signedData?.signedUrl) {
    return (
      <ReaderFallback
        title="We could not load this book."
        description="This reading link expired. Please reopen the book from your library."
        actionLabel="Back to Library"
        retryHref={ROUTES.reader(book.id)}
      />
    );
  }

  return (
    <section className="h-full min-h-0 w-full overflow-hidden bg-[#f6efe3]">
      <EpubReader
        fileUrl={signedData.signedUrl}
        bookId={book.id}
        bookTitle={book.title}
        bookAuthor={author}
        sourceLanguage={book.language_from}
        targetLanguage={book.language_to}
        initialLocation={readingProgress.currentLocation}
        initialProgressPercentage={readingProgress.progressPercentage}
      />
    </section>
  );
}
