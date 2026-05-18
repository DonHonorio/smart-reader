"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import type { VocabularyBookFilterOption, VocabularySortOrder } from "@/types";

const SELECT_CLASS_NAME =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200";

const UNIT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "single_word", label: "Single word" },
  { value: "phrasal_verb", label: "Phrasal verb" },
  { value: "idiom", label: "Idiom" },
  { value: "collocation", label: "Collocation" },
  { value: "fixed_expression", label: "Fixed expression" },
  { value: "phrase", label: "Phrase" },
];

const SORT_OPTIONS: Array<{ value: VocabularySortOrder; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

type VocabularyFiltersProps = {
  initialSearch: string;
  initialUnitType: string;
  initialSort: VocabularySortOrder;
  initialBookId: string;
  books: VocabularyBookFilterOption[];
  helperText?: string;
};

function normalizeSort(value: string | null | undefined): VocabularySortOrder {
  return value === "oldest" ? "oldest" : "newest";
}

function normalizeQueryValue(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function VocabularyFilters({
  initialSearch,
  initialUnitType,
  initialSort,
  initialBookId,
  books,
  helperText,
}: VocabularyFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const [searchValue, setSearchValue] = useState(initialSearch);
  const [unitTypeValue, setUnitTypeValue] = useState(initialUnitType || "all");
  const [sortValue, setSortValue] = useState<VocabularySortOrder>(initialSort);
  const [bookIdValue, setBookIdValue] = useState(initialBookId || "all");

  function updateQueryParams(nextValues: {
    search?: string;
    unitType?: string;
    sort?: VocabularySortOrder;
    bookId?: string;
  }) {
    const nextParams = new URLSearchParams(searchParamsString);

    const nextSearch =
      nextValues.search !== undefined ? normalizeQueryValue(nextValues.search) : searchValue.trim();
    const nextUnitType =
      nextValues.unitType !== undefined
        ? normalizeQueryValue(nextValues.unitType)
        : normalizeQueryValue(unitTypeValue);
    const nextSort = nextValues.sort ?? sortValue;
    const nextBookId =
      nextValues.bookId !== undefined
        ? normalizeQueryValue(nextValues.bookId)
        : normalizeQueryValue(bookIdValue);

    if (nextSearch) {
      nextParams.set("search", nextSearch);
    } else {
      nextParams.delete("search");
    }

    if (nextUnitType && nextUnitType !== "all") {
      nextParams.set("type", nextUnitType);
    } else {
      nextParams.delete("type");
    }

    nextParams.set("sort", nextSort);

    if (nextBookId && nextBookId !== "all") {
      nextParams.set("book", nextBookId);
    } else {
      nextParams.delete("book");
    }

    const nextQuery = nextParams.toString();

    if (nextQuery === searchParamsString) {
      return;
    }

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  return (
    <section
      id="vocabulary-filters-panel"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5 text-sm text-slate-700">
          <span className="font-medium">Search</span>
          <Input
            value={searchValue}
            onChange={(event) => {
              const nextSearch = event.target.value;
              setSearchValue(nextSearch);
              updateQueryParams({ search: nextSearch });
            }}
            placeholder="Search term, translation, or context"
            aria-label="Search saved vocabulary"
          />
        </label>

        <label className="space-y-1.5 text-sm text-slate-700">
          <span className="font-medium">Type</span>
          <select
            value={unitTypeValue}
            onChange={(event) => {
              const nextUnitType = event.target.value;
              setUnitTypeValue(nextUnitType);
              updateQueryParams({ unitType: nextUnitType });
            }}
            className={SELECT_CLASS_NAME}
            aria-label="Filter by vocabulary type"
          >
            {UNIT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm text-slate-700">
          <span className="font-medium">Sort</span>
          <select
            value={sortValue}
            onChange={(event) => {
              const nextSort = normalizeSort(event.target.value);
              setSortValue(nextSort);
              updateQueryParams({ sort: nextSort });
            }}
            className={SELECT_CLASS_NAME}
            aria-label="Sort vocabulary"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {books.length > 0 ? (
          <label className="space-y-1.5 text-sm text-slate-700">
            <span className="font-medium">Book</span>
            <select
              value={bookIdValue}
              onChange={(event) => {
                const nextBookId = event.target.value;
                setBookIdValue(nextBookId);
                updateQueryParams({ bookId: nextBookId });
              }}
              className={SELECT_CLASS_NAME}
              aria-label="Filter by book"
            >
              <option value="all">All books</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="hidden xl:block" aria-hidden />
        )}
      </div>

      {helperText && <p className="mt-2 text-xs leading-5 text-slate-600">{helperText}</p>}
    </section>
  );
}
