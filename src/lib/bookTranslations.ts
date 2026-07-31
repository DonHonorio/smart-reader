import type {
  BookTranslation,
  BookTranslationRow,
  BookTranslationsResponse,
  CreateBookTranslationRequest,
  CreateBookTranslationResponse,
} from "@/types";

export const BOOK_TRANSLATION_FIELDS =
  "id, user_id, book_id, cfi_range, chapter_href, selected_text, context_sentence, detected_expression, base_form, translation, unit_type, confidence, source_language, target_language, provider, requested_model, actual_model, created_at, updated_at";

export const MAX_BOOK_TRANSLATION_CFI_LENGTH = 2000;
export const MAX_BOOK_TRANSLATION_TEXT_LENGTH = 300;
export const MAX_BOOK_TRANSLATION_CONTEXT_LENGTH = 1000;

const CONFIDENCE_SCORE_BY_LABEL: Record<string, number> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
};

const DEFAULT_CONFIDENCE_LABEL = "medium";

type BookTranslationLogEvent =
  | "FOUND"
  | "AI_REQUIRED"
  | "SAVED"
  | "HIGHLIGHT_APPLIED"
  | "SAVE_FAILED";

/**
 * Development-only breadcrumb. Never logs book content, keys or tokens.
 */
export function logBookTranslationEvent(
  event: BookTranslationLogEvent,
  details?: Record<string, string | number | boolean | null>,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.debug(`[book-translation] ${event}`, details);
    return;
  }

  console.debug(`[book-translation] ${event}`);
}

export function normalizeBookTranslationText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Textual AI confidence ("high" | "medium" | "low") to the stored numeric score. */
export function confidenceLabelToScore(value: string | null | undefined) {
  const normalized = normalizeBookTranslationText(value).toLowerCase();

  if (!normalized) {
    return null;
  }

  return CONFIDENCE_SCORE_BY_LABEL[normalized] ?? null;
}

/** Stored numeric score back to the label the translation panel and vocabulary use. */
export function confidenceScoreToLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONFIDENCE_LABEL;
  }

  if (value >= 0.9) {
    return "high";
  }

  if (value >= 0.5) {
    return DEFAULT_CONFIDENCE_LABEL;
  }

  return "low";
}

export function buildTranslationCacheKey(cfiRange: string, targetLanguage: string) {
  return `${cfiRange}|${targetLanguage}`;
}

/** A translation that could not be persisted keeps an empty id. */
export function isPersistedTranslationId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function mapBookTranslationRow(row: BookTranslationRow): BookTranslation {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    cfiRange: row.cfi_range,
    chapterHref: row.chapter_href,
    selectedText: row.selected_text,
    contextSentence: row.context_sentence,
    detectedExpression: row.detected_expression,
    baseForm: row.base_form,
    translation: row.translation,
    unitType: row.unit_type,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    provider: row.provider,
    requestedModel: row.requested_model,
    actualModel: row.actual_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isBookTranslationLike(value: unknown): value is BookTranslation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BookTranslation>;

  return (
    typeof candidate.cfiRange === "string" &&
    typeof candidate.selectedText === "string" &&
    typeof candidate.translation === "string"
  );
}

function normalizeTranslationList(value: unknown): BookTranslation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isBookTranslationLike);
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Builds an in-memory translation for a result the AI produced but Supabase could not store.
 * It keeps the reader usable (panel + highlight) for the rest of the session.
 */
export function buildLocalBookTranslation(
  input: CreateBookTranslationRequest,
  userId = "",
): BookTranslation {
  const now = new Date().toISOString();

  return {
    id: "",
    userId,
    bookId: input.bookId,
    cfiRange: input.cfiRange,
    chapterHref: input.chapterHref ?? null,
    selectedText: input.selectedText,
    contextSentence: input.contextSentence ?? null,
    detectedExpression: input.detectedExpression ?? null,
    baseForm: input.baseForm ?? null,
    translation: input.translation,
    unitType: input.unitType ?? null,
    confidence: confidenceLabelToScore(input.confidence),
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    provider: null,
    requestedModel: null,
    actualModel: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Browser helper: translations already stored for a chapter of a book.
 * Returns null when the request fails so the reader can keep working offline-ish.
 */
export async function fetchChapterBookTranslations(params: {
  bookId: string;
  chapterHref: string;
  signal?: AbortSignal;
}): Promise<BookTranslationsResponse | null> {
  const search = new URLSearchParams({
    bookId: params.bookId,
    chapterHref: params.chapterHref,
  });

  try {
    const response = await fetch(`/api/book-translations?${search.toString()}`, {
      method: "GET",
      signal: params.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Partial<BookTranslationsResponse>;

    return {
      translations: normalizeTranslationList(data.translations),
      savedVocabularyTranslationIds: normalizeIdList(data.savedVocabularyTranslationIds),
    };
  } catch {
    return null;
  }
}

/** Browser helper: authoritative single lookup before spending an AI call. */
export async function fetchBookTranslationByCfi(params: {
  bookId: string;
  cfiRange: string;
  targetLanguage: string;
  signal?: AbortSignal;
}): Promise<BookTranslation | null> {
  const search = new URLSearchParams({
    bookId: params.bookId,
    cfiRange: params.cfiRange,
    targetLanguage: params.targetLanguage,
  });

  try {
    const response = await fetch(`/api/book-translations?${search.toString()}`, {
      method: "GET",
      signal: params.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Partial<BookTranslationsResponse>;
    const [translation] = normalizeTranslationList(data.translations);

    return translation ?? null;
  } catch {
    return null;
  }
}

/** Browser helper: persist a translation. Returns null when persistence failed. */
export async function persistBookTranslation(
  input: CreateBookTranslationRequest,
  signal?: AbortSignal,
): Promise<CreateBookTranslationResponse | null> {
  try {
    const response = await fetch("/api/book-translations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Partial<CreateBookTranslationResponse>;

    if (!isBookTranslationLike(data.translation)) {
      return null;
    }

    return {
      translation: data.translation,
      status: data.status === "already_exists" ? "already_exists" : "created",
    };
  } catch {
    return null;
  }
}
