import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { EpubReader } from "@/components/reader/EpubReader";
import { getUserBookById, getUserReadingProgressByBookId } from "@/lib/books";
import { ROUTES } from "@/lib/constants";

type ReaderBookPageProps = {
  params: Promise<{
    bookId: string;
  }>;
};

type ReaderFallbackProps = {
  title: string;
  description: string;
  actionLabel: string;
};

function ReaderFallback({ title, description, actionLabel }: ReaderFallbackProps) {
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
      </div>
    </section>
  );
}

export default async function ReaderBookPage({ params }: ReaderBookPageProps) {
  const { bookId } = await params;

  // Consultas independientes: ambas estan acotadas al usuario autenticado por si mismas,
  // asi que se piden a la vez en lugar de encadenar dos viajes a Supabase.
  const [book, readingProgress] = await Promise.all([
    getUserBookById(bookId),
    getUserReadingProgressByBookId(bookId),
  ]);

  if (!book) {
    return (
      <ReaderFallback
        title="We could not open this book."
        description="This book was not found in your account library."
        actionLabel="Back to Library"
      />
    );
  }

  const author = book.author?.trim() ? book.author : "Unknown author";

  if (!book.file_path) {
    return (
      <ReaderFallback
        title="This book file is missing."
        description="This EPUB file is missing in storage. Re-upload it from your library to continue."
        actionLabel="Back to Library"
      />
    );
  }

  // The signed URL is intentionally not created here: it is temporary and this
  // payload can be replayed from the client router cache long after it expired.
  // The reader requests a fresh one from /api/books/access on every load.
  return (
    <section className="h-full min-h-0 w-full overflow-hidden bg-[#f6efe3]">
      <EpubReader
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
