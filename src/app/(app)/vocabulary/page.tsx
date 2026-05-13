import { VocabularyFilters } from "@/components/vocabulary/VocabularyFilters";
import { VocabularyList } from "@/components/vocabulary/VocabularyList";
import { getUserBooks } from "@/lib/books";
import { getUserVocabularyItems } from "@/lib/vocabulary";
import type {
  GetUserVocabularyItemsParams,
  VocabularyBookFilterOption,
  VocabularySortOrder,
} from "@/types";

type SearchParamValue = string | string[] | undefined;

type VocabularyPageProps = {
  searchParams: Promise<{
    search?: SearchParamValue;
    type?: SearchParamValue;
    sort?: SearchParamValue;
    book?: SearchParamValue;
  }>;
};

function getFirstSearchParam(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeQueryValue(value: SearchParamValue) {
  return getFirstSearchParam(value).trim();
}

function normalizeUnitType(value: SearchParamValue) {
  const normalized = normalizeQueryValue(value);

  if (!normalized || normalized.toLowerCase() === "all") {
    return "";
  }

  return normalized;
}

function normalizeBookId(value: SearchParamValue) {
  const normalized = normalizeQueryValue(value);

  if (!normalized || normalized.toLowerCase() === "all") {
    return "";
  }

  return normalized;
}

function normalizeSort(value: SearchParamValue): VocabularySortOrder {
  return normalizeQueryValue(value) === "oldest" ? "oldest" : "newest";
}

function toBookFilterOptions(books: { id: string; title: string }[]): VocabularyBookFilterOption[] {
  return books
    .map((book) => ({
      id: book.id,
      title: book.title.trim() || "Untitled book",
    }))
    .sort((leftBook, rightBook) => leftBook.title.localeCompare(rightBook.title));
}

export default async function VocabularyPage({ searchParams }: VocabularyPageProps) {
  const params = await searchParams;
  const search = normalizeQueryValue(params.search);
  const unitType = normalizeUnitType(params.type);
  const sort = normalizeSort(params.sort);
  const bookId = normalizeBookId(params.book);
  const hasActiveFilters = Boolean(search || unitType || bookId);

  const vocabularyParams: GetUserVocabularyItemsParams = {
    search: search || undefined,
    unitType: unitType || undefined,
    bookId: bookId || undefined,
    sort,
  };

  const [items, books] = await Promise.all([
    getUserVocabularyItems(vocabularyParams),
    getUserBooks(),
  ]);
  const bookFilterOptions = toBookFilterOptions(books);
  const bookTitlesById = Object.fromEntries(bookFilterOptions.map((book) => [book.id, book.title]));
  const savedItemsLabel = `${items.length} saved item${items.length === 1 ? "" : "s"}`;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <div className="sticky top-0 z-20">
        <VocabularyFilters
          initialSearch={search}
          initialUnitType={unitType || "all"}
          initialSort={sort}
          initialBookId={bookId || "all"}
          books={bookFilterOptions}
          helperText="Your saved terms, expressions, and context sentences collected while reading."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">{savedItemsLabel}</p>
        {hasActiveFilters && <p className="text-xs text-slate-500">Showing filtered results</p>}
      </div>

      <VocabularyList
        items={items}
        hasActiveFilters={hasActiveFilters}
        bookTitlesById={bookTitlesById}
      />
    </section>
  );
}
