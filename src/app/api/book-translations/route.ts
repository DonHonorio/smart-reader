import { NextResponse } from "next/server";
import { resolveModel, resolveProvider } from "@/lib/ai/config";
import {
  MAX_BOOK_TRANSLATION_CFI_LENGTH,
  MAX_BOOK_TRANSLATION_CONTEXT_LENGTH,
  MAX_BOOK_TRANSLATION_TEXT_LENGTH,
  normalizeBookTranslationText,
} from "@/lib/bookTranslations";
import {
  createBookTranslation,
  getChapterTranslations,
  getSavedVocabularyTranslationIds,
  getTranslationByCfi,
  getBookTranslations,
} from "@/lib/bookTranslationsService";
import { createClient } from "@/lib/supabase/server";
import type {
  BookTranslation,
  BookTranslationsResponse,
  CreateBookTranslationRequest,
  CreateBookTranslationResponse,
} from "@/types";

const MAX_CHAPTER_HREF_LENGTH = 500;
const MAX_TRANSLATION_LENGTH = 500;
const MAX_LANGUAGE_LENGTH = 50;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mapServiceError(code: string | undefined, fallbackMessage: string) {
  if (code === "42501") {
    return { status: 403, message: "Not allowed to access these translations." };
  }

  if (code === "23503") {
    return { status: 404, message: "Book not found." };
  }

  if (code === "42P01") {
    return { status: 500, message: "The book_translations table is not available." };
  }

  if (code === "42703") {
    return {
      status: 500,
      message: "The book_translations table schema is missing expected columns.",
    };
  }

  return { status: 500, message: fallbackMessage };
}

function validateRequired(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") {
    return { ok: false as const, message: `${fieldName} is required.` };
  }

  const normalized = normalizeBookTranslationText(value);

  if (!normalized) {
    return { ok: false as const, message: `${fieldName} is required.` };
  }

  if (normalized.length > maxLength) {
    return { ok: false as const, message: `${fieldName} is too long.` };
  }

  return { ok: true as const, value: normalized };
}

function normalizeOptional(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeBookTranslationText(value);

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

/**
 * The CFI must keep its exact shape (offsets, ranges, assertions), so it is only
 * trimmed — never whitespace-collapsed like regular text.
 */
function normalizeCfiRange(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > MAX_BOOK_TRANSLATION_CFI_LENGTH) {
    return null;
  }

  return normalized;
}

async function resolveAuthorizedBook(bookId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const, response: jsonError("Authentication required.", 401) };
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id")
    .eq("id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bookError) {
    return { ok: false as const, response: jsonError("Could not verify book access.", 500) };
  }

  if (!book) {
    return { ok: false as const, response: jsonError("Book not found.", 404) };
  }

  return { ok: true as const, supabase, userId: user.id };
}

async function buildListResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  translations: BookTranslation[],
): Promise<BookTranslationsResponse> {
  const savedVocabularyTranslationIds = await getSavedVocabularyTranslationIds(
    supabase,
    userId,
    translations.map((translation) => translation.id),
  );

  return {
    translations,
    savedVocabularyTranslationIds,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookId = (url.searchParams.get("bookId") ?? "").trim();

  if (!bookId) {
    return jsonError("bookId is required.", 400);
  }

  const chapterHref = normalizeOptional(url.searchParams.get("chapterHref"), MAX_CHAPTER_HREF_LENGTH);
  const cfiRange = normalizeCfiRange(url.searchParams.get("cfiRange"));
  const targetLanguage = normalizeOptional(url.searchParams.get("targetLanguage"), MAX_LANGUAGE_LENGTH);

  try {
    const authorized = await resolveAuthorizedBook(bookId);

    if (!authorized.ok) {
      return authorized.response;
    }

    const { supabase, userId } = authorized;

    if (cfiRange) {
      if (!targetLanguage) {
        return jsonError("targetLanguage is required when cfiRange is provided.", 400);
      }

      const result = await getTranslationByCfi(supabase, userId, bookId, cfiRange, targetLanguage);

      if (!result.ok) {
        const mapped = mapServiceError(result.error.code, "Could not load translation.");
        return jsonError(mapped.message, mapped.status);
      }

      return NextResponse.json(
        await buildListResponse(supabase, userId, result.data ? [result.data] : []),
      );
    }

    const result = chapterHref
      ? await getChapterTranslations(supabase, userId, bookId, chapterHref)
      : await getBookTranslations(supabase, userId, bookId);

    if (!result.ok) {
      const mapped = mapServiceError(result.error.code, "Could not load translations.");
      return jsonError(mapped.message, mapped.status);
    }

    return NextResponse.json(await buildListResponse(supabase, userId, result.data));
  } catch (error) {
    console.error("/api/book-translations GET unexpected error:", error);
    return jsonError("Could not load translations.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const payload = (body ?? {}) as Partial<CreateBookTranslationRequest>;

  const validatedBookId = validateRequired(payload.bookId, "bookId", 200);

  if (!validatedBookId.ok) {
    return jsonError(validatedBookId.message, 400);
  }

  const cfiRange = normalizeCfiRange(payload.cfiRange);

  if (!cfiRange) {
    return jsonError("cfiRange is required.", 400);
  }

  const validatedSelectedText = validateRequired(
    payload.selectedText,
    "selectedText",
    MAX_BOOK_TRANSLATION_TEXT_LENGTH,
  );

  if (!validatedSelectedText.ok) {
    return jsonError(validatedSelectedText.message, 400);
  }

  const validatedTranslation = validateRequired(
    payload.translation,
    "translation",
    MAX_TRANSLATION_LENGTH,
  );

  if (!validatedTranslation.ok) {
    return jsonError(validatedTranslation.message, 400);
  }

  const validatedSourceLanguage = validateRequired(
    payload.sourceLanguage,
    "sourceLanguage",
    MAX_LANGUAGE_LENGTH,
  );

  if (!validatedSourceLanguage.ok) {
    return jsonError(validatedSourceLanguage.message, 400);
  }

  const validatedTargetLanguage = validateRequired(
    payload.targetLanguage,
    "targetLanguage",
    MAX_LANGUAGE_LENGTH,
  );

  if (!validatedTargetLanguage.ok) {
    return jsonError(validatedTargetLanguage.message, 400);
  }

  try {
    const authorized = await resolveAuthorizedBook(validatedBookId.value);

    if (!authorized.ok) {
      return authorized.response;
    }

    const { supabase, userId } = authorized;
    const provider = resolveProvider();

    const result = await createBookTranslation(supabase, userId, {
      bookId: validatedBookId.value,
      cfiRange,
      chapterHref: normalizeOptional(payload.chapterHref, MAX_CHAPTER_HREF_LENGTH),
      selectedText: validatedSelectedText.value,
      contextSentence: normalizeOptional(
        payload.contextSentence,
        MAX_BOOK_TRANSLATION_CONTEXT_LENGTH,
      ),
      detectedExpression: normalizeOptional(
        payload.detectedExpression,
        MAX_BOOK_TRANSLATION_TEXT_LENGTH,
      ),
      baseForm: normalizeOptional(payload.baseForm, MAX_BOOK_TRANSLATION_TEXT_LENGTH),
      translation: validatedTranslation.value,
      unitType: normalizeOptional(payload.unitType, 100),
      confidence: normalizeOptional(payload.confidence, 100),
      sourceLanguage: validatedSourceLanguage.value,
      targetLanguage: validatedTargetLanguage.value,
      provider,
      requestedModel: resolveModel(provider),
    });

    if (!result.ok) {
      console.error("/api/book-translations insert error:", result.error.message);
      const mapped = mapServiceError(result.error.code, "Could not save translation right now.");
      return jsonError(mapped.message, mapped.status);
    }

    const response: CreateBookTranslationResponse = {
      translation: result.data.translation,
      status: result.data.status,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("/api/book-translations POST unexpected error:", error);
    return jsonError("Could not save translation right now.", 500);
  }
}
