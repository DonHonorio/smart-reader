import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  GetUserVocabularyItemsParams,
  VocabularyItem,
  VocabularySortOrder,
} from "@/types";

export const VOCABULARY_FIELDS =
  "id, user_id, book_id, selected_text, term, canonical_unit, translation, context_sentence, unit_type, confidence, status, created_at";
const DEFAULT_VOCABULARY_ITEMS_LIMIT = 200;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSort(sort: VocabularySortOrder | undefined): VocabularySortOrder {
  return sort === "oldest" ? "oldest" : "newest";
}

function normalizeUnitTypeFilter(value: string | undefined) {
  const normalized = normalizeText(value);

  if (!normalized || normalized.toLowerCase() === "all") {
    return null;
  }

  return normalized;
}

function normalizeBookFilter(value: string | undefined) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeSearchQuery(value: string | undefined) {
  return normalizeText(value).toLowerCase();
}

function normalizeLimit(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_VOCABULARY_ITEMS_LIMIT;
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    return DEFAULT_VOCABULARY_ITEMS_LIMIT;
  }

  return Math.min(normalized, DEFAULT_VOCABULARY_ITEMS_LIMIT);
}

function matchesSearchQuery(item: VocabularyItem, searchQuery: string) {
  if (!searchQuery) {
    return true;
  }

  const searchableValues = [
    item.term,
    item.canonical_unit,
    item.translation,
    item.context_sentence,
  ];

  return searchableValues.some((value) => normalizeText(value).toLowerCase().includes(searchQuery));
}

export async function getUserVocabularyItems(
  params: GetUserVocabularyItemsParams = {},
): Promise<VocabularyItem[]> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserVocabularyItems auth error:", authError.message);
    return [];
  }

  if (!user) {
    return [];
  }

  const sort = normalizeSort(params.sort);
  const unitType = normalizeUnitTypeFilter(params.unitType);
  const bookId = normalizeBookFilter(params.bookId);
  const searchQuery = normalizeSearchQuery(params.search);
  const limit = normalizeLimit(params.limit);

  let query = supabase
    .from("vocabulary_items")
    .select(VOCABULARY_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: sort === "oldest" })
    .limit(limit);

  if (unitType) {
    query = query.eq("unit_type", unitType);
  }

  if (bookId) {
    query = query.eq("book_id", bookId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getUserVocabularyItems query error:", error.message);
    return [];
  }

  const items = (data ?? []) as VocabularyItem[];

  if (!searchQuery) {
    return items;
  }

  return items.filter((item) => matchesSearchQuery(item, searchQuery));
}

export async function getUserVocabularyItemsForExport(): Promise<VocabularyItem[]> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserVocabularyItemsForExport auth error:", authError.message);
    return [];
  }

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("vocabulary_items")
    .select(VOCABULARY_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getUserVocabularyItemsForExport query error:", error.message);
    return [];
  }

  return (data ?? []) as VocabularyItem[];
}