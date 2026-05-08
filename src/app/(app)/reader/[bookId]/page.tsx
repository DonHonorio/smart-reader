import Link from "next/link";
import { Card } from "@/components/ui/Card";
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

export default async function ReaderBookPage({ params }: ReaderBookPageProps) {
  const { bookId } = await params;
  const book = await getUserBookById(bookId);

  if (!book) {
    return (
      <section className="mx-auto w-full max-w-4xl py-2">
        <Card
          title="Book not found"
          description="We could not find a readable book for your account."
          footer={
            <Link href={ROUTES.library} className={buttonClassNames({ variant: "secondary" })}>
              Back to library
            </Link>
          }
        />
      </section>
    );
  }

  const readingProgress = await getUserReadingProgressByBookId(book.id);

  const author = book.author?.trim() ? book.author : "Unknown author";

  if (!book.file_path) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-4 py-2">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {book.title}
          </h1>
          <p className="text-sm text-slate-600">{author}</p>
        </header>

        <Card
          title="This book has no EPUB file yet"
          description="Upload the EPUB file from your library and try again."
          footer={
            <Link href={ROUTES.library} className={buttonClassNames({ variant: "secondary" })}>
              Go to library
            </Link>
          }
        />
      </section>
    );
  }

  const supabase = await createClient();
  const { data: signedData, error: signedUrlError } = await supabase.storage
    .from("books")
    .createSignedUrl(book.file_path, 60 * 30);

  if (signedUrlError || !signedData?.signedUrl) {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <Card
          title="Could not open this EPUB"
          description="The temporary file URL could not be generated. Please try again from your library."
          footer={
            <Link href={ROUTES.library} className={buttonClassNames({ variant: "secondary" })}>
              Back to library
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-3 overflow-hidden py-1 md:py-0">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 md:hidden">
        <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-900">{book.title}</p>
        <Link href={ROUTES.library} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
          Library
        </Link>
      </div>

      <div className="hidden shrink-0 items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 md:flex">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{book.title}</h1>
          <p className="truncate text-sm text-slate-600">{author}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <p className="whitespace-nowrap font-medium text-slate-700">
            {book.language_from} -&gt; {book.language_to}
          </p>
          <p className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 font-semibold uppercase tracking-wide text-slate-700">
            {book.status}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <EpubReader
          fileUrl={signedData.signedUrl}
          bookId={book.id}
          sourceLanguage={book.language_from}
          targetLanguage={book.language_to}
          initialLocation={readingProgress.currentLocation}
        />
      </div>
    </section>
  );
}
