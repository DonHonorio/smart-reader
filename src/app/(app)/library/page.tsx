import { BookCard } from "@/components/books/BookCard";
import { EmptyLibraryState } from "@/components/books/EmptyLibraryState";
import { UploadBookButton } from "@/components/books/UploadBookButton";
import { UploadBookForm } from "@/components/books/UploadBookForm";
import { getUserBooks } from "@/lib/books";

export default async function LibraryPage() {
  const books = await getUserBooks();
  const hasBooks = books.length > 0;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Library</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Your uploaded books and reading sessions in one place.
        </p>
      </header>

      <div id="upload-book-panel">
        <UploadBookButton initiallyOpen={!hasBooks}>
          <UploadBookForm />
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
