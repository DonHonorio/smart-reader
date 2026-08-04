import {
  BOOK_TRANSLATION_FIELDS,
  confidenceLabelToScore,
  mapBookTranslationRow,
  normalizeBookTranslationText,
} from "@/lib/bookTranslations";
import { createClient } from "@/lib/supabase/server";
import type {
  BookTranslation,
  BookTranslationRow,
  CreateBookTranslationRequest,
  CreateBookTranslationStatus,
  VocabularyItem,
} from "@/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ServiceError = {
  code?: string;
  message?: string;
};

export type BookTranslationServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

const DEFAULT_TRANSLATIONS_LIMIT = 500;
const UNIQUE_VIOLATION_CODE = "23505";

function failure(error: ServiceError | null | undefined): {
  ok: false;
  error: ServiceError;
} {
  return { ok: false, error: error ?? {} };
}

function mapRows(rows: unknown): BookTranslation[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return (rows as BookTranslationRow[]).map(mapBookTranslationRow);
}

/** Every translation stored for a book. Used for whole-book reads, not per page turn. */
export async function getBookTranslations(
  supabase: SupabaseServerClient,
  userId: string,
  bookId: string,
): Promise<BookTranslationServiceResult<BookTranslation[]>> {
  const { data, error } = await supabase
    .from("book_translations")
    .select(BOOK_TRANSLATION_FIELDS)
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: true })
    .limit(DEFAULT_TRANSLATIONS_LIMIT);

  if (error) {
    return failure(error);
  }

  return { ok: true, data: mapRows(data) };
}

/** Translations for a single chapter. This is what the reader loads while reading. */
export async function getChapterTranslations(
  supabase: SupabaseServerClient,
  userId: string,
  bookId: string,
  chapterHref: string,
): Promise<BookTranslationServiceResult<BookTranslation[]>> {
  const { data, error } = await supabase
    .from("book_translations")
    .select(BOOK_TRANSLATION_FIELDS)
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .eq("chapter_href", chapterHref)
    .order("created_at", { ascending: true })
    .limit(DEFAULT_TRANSLATIONS_LIMIT);

  if (error) {
    return failure(error);
  }

  return { ok: true, data: mapRows(data) };
}

/** Exact position lookup: the check that prevents a redundant AI call. */
export async function getTranslationByCfi(
  supabase: SupabaseServerClient,
  userId: string,
  bookId: string,
  cfiRange: string,
  targetLanguage: string,
): Promise<BookTranslationServiceResult<BookTranslation | null>> {
  const { data, error } = await supabase
    .from("book_translations")
    .select(BOOK_TRANSLATION_FIELDS)
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .eq("cfi_range", cfiRange)
    .eq("target_language", targetLanguage)
    .maybeSingle();

  if (error) {
    return failure(error);
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return { ok: true, data: mapBookTranslationRow(data as BookTranslationRow) };
}

/**
 * Inserts a translation. Concurrent inserts for the same position resolve to the
 * existing row instead of surfacing a unique-constraint error.
 */
export async function createBookTranslation(
  supabase: SupabaseServerClient,
  userId: string,
  input: CreateBookTranslationRequest & { provider: string | null; requestedModel: string | null },
): Promise<
  BookTranslationServiceResult<{
    translation: BookTranslation;
    status: CreateBookTranslationStatus;
  }>
> {
  const insertPayload = {
    user_id: userId,
    book_id: input.bookId,
    cfi_range: input.cfiRange,
    chapter_href: normalizeBookTranslationText(input.chapterHref) || null,
    selected_text: input.selectedText,
    context_sentence: normalizeBookTranslationText(input.contextSentence) || null,
    detected_expression: normalizeBookTranslationText(input.detectedExpression) || null,
    base_form: normalizeBookTranslationText(input.baseForm) || null,
    translation: input.translation,
    unit_type: normalizeBookTranslationText(input.unitType) || null,
    confidence: confidenceLabelToScore(input.confidence),
    source_language: input.sourceLanguage,
    target_language: input.targetLanguage,
    provider: input.provider,
    requested_model: input.requestedModel,
    // The AI layer does not expose which model actually answered, so it stays null.
    actual_model: null,
  };

  const { data, error } = await supabase
    .from("book_translations")
    .insert(insertPayload)
    .select(BOOK_TRANSLATION_FIELDS)
    .maybeSingle();

  if (!error && data) {
    return {
      ok: true,
      data: {
        translation: mapBookTranslationRow(data as BookTranslationRow),
        status: "created",
      },
    };
  }

  const isDuplicate = error?.code === UNIQUE_VIOLATION_CODE;

  if (error && !isDuplicate) {
    return failure(error);
  }

  const existing = await getTranslationByCfi(
    supabase,
    userId,
    input.bookId,
    input.cfiRange,
    input.targetLanguage,
  );

  if (!existing.ok) {
    return existing;
  }

  if (!existing.data) {
    return failure(error ?? { message: "Translation row could not be read back." });
  }

  return {
    ok: true,
    data: {
      translation: existing.data,
      status: isDuplicate ? "already_exists" : "created",
    },
  };
}

/**
 * A stored translation by id, scoped to its owner. Returns null both when the row
 * does not exist and when it belongs to somebody else, so the caller cannot leak
 * the difference to the client.
 */
export async function getTranslationById(
  supabase: SupabaseServerClient,
  userId: string,
  bookTranslationId: string,
): Promise<BookTranslationServiceResult<BookTranslation | null>> {
  const { data, error } = await supabase
    .from("book_translations")
    .select(BOOK_TRANSLATION_FIELDS)
    .eq("id", bookTranslationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return failure(error);
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return { ok: true, data: mapBookTranslationRow(data as BookTranslationRow) };
}

/** The vocabulary item created from a stored translation, when it exists. */
export async function getVocabularyItemByTranslation(
  supabase: SupabaseServerClient,
  userId: string,
  bookTranslationId: string,
): Promise<BookTranslationServiceResult<VocabularyItem | null>> {
  const { data, error } = await supabase
    .from("vocabulary_items")
    .select("*")
    .eq("user_id", userId)
    .eq("book_translation_id", bookTranslationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return failure(error);
  }

  return { ok: true, data: (data as VocabularyItem | null) ?? null };
}

/**
 * Which of the given translations already produced a vocabulary item.
 * Lets the panel open directly in the `saved_vocabulary` state.
 */
export async function getSavedVocabularyTranslationIds(
  supabase: SupabaseServerClient,
  userId: string,
  bookTranslationIds: string[],
): Promise<string[]> {
  if (bookTranslationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("vocabulary_items")
    .select("book_translation_id")
    .eq("user_id", userId)
    .in("book_translation_id", bookTranslationIds);

  if (error) {
    // A legacy schema without the column must not break reading.
    console.error("getSavedVocabularyTranslationIds query error:", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{ book_translation_id: string | null }>;

  return rows
    .map((row) => row.book_translation_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}
