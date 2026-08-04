import { NextResponse } from "next/server";
import { confidenceScoreToLabel } from "@/lib/bookTranslations";
import { getTranslationById } from "@/lib/bookTranslationsService";
import { createClient } from "@/lib/supabase/server";
import type {
  BookTranslation,
  SaveVocabularyErrorCode,
  SaveVocabularyErrorResponse,
  SaveVocabularyRequest,
  SaveVocabularyResponse,
  VocabularyItem,
} from "@/types";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
};

type InsertVocabularyPayload = {
  user_id: string;
  book_id: string;
  selected_text: string;
  term: string;
  canonical_unit: string;
  translation: string;
  context_sentence: string;
  unit_type: string;
  confidence: string;
  status: "saved";
  book_translation_id?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeOptionalBookTranslationId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function jsonError(
  message: string,
  status: number,
  code: SaveVocabularyErrorCode = "SAVE_FAILED",
  debugContext?: Record<string, unknown>,
) {
  if (status === 400) {
    console.warn("/api/vocabulary bad request:", {
      message,
      ...debugContext,
    });
  }

  const payload: SaveVocabularyErrorResponse = { error: message, code };

  return NextResponse.json(payload, { status });
}

function mapSupabaseError(
  error: SupabaseErrorLike | null | undefined,
  fallbackMessage: string,
): { status: number; message: string; code: SaveVocabularyErrorCode } {
  if (!error?.code) {
    return { status: 500, message: fallbackMessage, code: "SAVE_FAILED" };
  }

  if (error.code === "42501") {
    return {
      status: 403,
      message: "Not allowed to save vocabulary for this user.",
      code: "SAVE_FAILED",
    };
  }

  if (error.code === "23503") {
    return {
      status: 404,
      message: "Book not found.",
      code: "BOOK_NOT_FOUND",
    };
  }

  if (error.code === "23505") {
    return {
      status: 409,
      message: "This vocabulary item is already saved.",
      code: "SAVE_FAILED",
    };
  }

  if (error.code === "42P01") {
    return {
      status: 500,
      message: "The vocabulary_items table is not available.",
      code: "SAVE_FAILED",
    };
  }

  if (error.code === "42703") {
    return {
      status: 500,
      message: "The vocabulary_items table schema is missing expected columns.",
      code: "SAVE_FAILED",
    };
  }

  return { status: 500, message: fallbackMessage, code: "SAVE_FAILED" };
}

function buildFallbackVocabularyItem(
  insertPayload: InsertVocabularyPayload,
  useLegacyShape = false,
): VocabularyItem {
  const now = new Date().toISOString();

  return {
    id: "",
    user_id: insertPayload.user_id,
    book_id: insertPayload.book_id,
    selected_text: useLegacyShape ? insertPayload.term : insertPayload.selected_text,
    term: insertPayload.term,
    canonical_unit: useLegacyShape ? null : insertPayload.canonical_unit,
    translation: insertPayload.translation,
    context_sentence: insertPayload.context_sentence,
    unit_type: useLegacyShape ? null : insertPayload.unit_type,
    confidence: useLegacyShape ? null : insertPayload.confidence,
    status: insertPayload.status,
    created_at: now,
  };
}

function validateRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; response: NextResponse } {
  if (typeof value !== "string") {
    return {
      ok: false,
      response: jsonError(`${fieldName} is required.`, 400, "INVALID_REQUEST", {
        reason: "invalid_type",
        fieldName,
        receivedType: typeof value,
      }),
    };
  }

  const normalized = normalizeText(value);

  if (!normalized) {
    return {
      ok: false,
      response: jsonError(`${fieldName} is required.`, 400, "INVALID_REQUEST", {
        reason: "required_empty",
        fieldName,
      }),
    };
  }

  if (normalized.length > maxLength) {
    return {
      ok: false,
      response: jsonError(`${fieldName} is too long.`, 400, "INVALID_REQUEST", {
        reason: "max_length_exceeded",
        fieldName,
        maxLength,
        actualLength: normalized.length,
      }),
    };
  }

  return { ok: true, value: normalized };
}

/**
 * Fields the row is written with. When the save comes from a persistent translation,
 * they are read back from `book_translations` instead of trusted from the client, so a
 * manipulated payload cannot store something different from what the reader shows.
 */
type ResolvedVocabularyFields = {
  bookId: string;
  selectedText: string;
  term: string;
  canonicalUnit: string;
  translation: string;
  contextSentence: string;
  unitType: string;
  confidence: string;
};

function resolveFieldsFromTranslation(
  translation: BookTranslation,
  clientFields: ResolvedVocabularyFields,
): ResolvedVocabularyFields {
  const selectedText = normalizeText(translation.selectedText) || clientFields.selectedText;
  const term = normalizeText(translation.detectedExpression ?? "") || selectedText;
  const canonicalUnit = normalizeText(translation.baseForm ?? "") || term;
  const contextSentence =
    normalizeText(translation.contextSentence ?? "") || clientFields.contextSentence;

  return {
    bookId: translation.bookId,
    selectedText,
    term,
    canonicalUnit,
    translation: normalizeText(translation.translation) || clientFields.translation,
    contextSentence,
    unitType: normalizeText(translation.unitType ?? "") || clientFields.unitType,
    // book_translations stores a numeric score; vocabulary_items keeps the label.
    confidence: confidenceScoreToLabel(translation.confidence),
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("Authentication required.", 401, "UNAUTHENTICATED");
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 50;
    const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";

    const { data, error } = await supabase
      .from("vocabulary_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: sort === "oldest" })
      .limit(limit);

    if (error) {
      const mappedError = mapSupabaseError(error, "Could not load vocabulary.");
      return jsonError(mappedError.message, mappedError.status, mappedError.code);
    }

    return NextResponse.json({ items: (data ?? []) as VocabularyItem[] });
  } catch (error) {
    console.error("/api/vocabulary GET unexpected error:", error);
    return jsonError("Could not load vocabulary.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400, "INVALID_REQUEST", {
      reason: "invalid_json",
    });
  }

  const {
    bookId,
    selectedText,
    term,
    canonicalUnit,
    translation,
    contextSentence,
    unitType,
    confidence,
    bookTranslationId,
  } = (body ?? {}) as Partial<SaveVocabularyRequest>;

  const normalizedBookTranslationId = normalizeOptionalBookTranslationId(bookTranslationId);

  const validatedBookId = validateRequiredString(bookId, "bookId", 200);

  if (!validatedBookId.ok) {
    return validatedBookId.response;
  }

  const validatedSelectedText = validateRequiredString(selectedText, "selectedText", 300);

  if (!validatedSelectedText.ok) {
    return validatedSelectedText.response;
  }

  const validatedTerm = validateRequiredString(term, "term", 300);

  if (!validatedTerm.ok) {
    return validatedTerm.response;
  }

  const validatedCanonicalUnit = validateRequiredString(canonicalUnit, "canonicalUnit", 300);

  if (!validatedCanonicalUnit.ok) {
    return validatedCanonicalUnit.response;
  }

  const validatedTranslation = validateRequiredString(translation, "translation", 500);

  if (!validatedTranslation.ok) {
    return validatedTranslation.response;
  }

  const validatedContextSentence = validateRequiredString(contextSentence, "contextSentence", 1000);

  if (!validatedContextSentence.ok) {
    return validatedContextSentence.response;
  }

  const validatedUnitType = validateRequiredString(unitType, "unitType", 100);

  if (!validatedUnitType.ok) {
    return validatedUnitType.response;
  }

  const validatedConfidence = validateRequiredString(confidence, "confidence", 100);

  if (!validatedConfidence.ok) {
    return validatedConfidence.response;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("/api/vocabulary auth error:", authError.message);
      return jsonError("Authentication required.", 401, "UNAUTHENTICATED");
    }

    if (!user) {
      return jsonError("Authentication required.", 401, "UNAUTHENTICATED");
    }

    let effectiveBookId = validatedBookId.value;

    if (validatedBookId.value === "onboarding-demo") {
      const { data: onboardingBook, error: onboardingBookError } = await supabase
        .from("books")
        .select("id")
        .eq("user_id", user.id)
        .eq("title", "Onboarding Demo")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (onboardingBookError) {
        console.error("/api/vocabulary onboarding book query error:", onboardingBookError.message);
        const mappedError = mapSupabaseError(onboardingBookError, "Could not verify onboarding book.");
        return jsonError(mappedError.message, mappedError.status, mappedError.code);
      }

      if (onboardingBook?.id) {
        effectiveBookId = onboardingBook.id;
      } else {
        const { data: createdBook, error: createBookError } = await supabase
          .from("books")
          .insert({
            user_id: user.id,
            title: "Onboarding Demo",
            author: "Smart-Reader",
            language_from: "en",
            language_to: "es",
            file_path: null,
            cover_path: null,
            status: "ready",
          })
          .select("id")
          .single();

        if (createBookError || !createdBook?.id) {
          console.error("/api/vocabulary onboarding book create error:", createBookError?.message);
          const mappedError = mapSupabaseError(createBookError, "Could not create onboarding book.");
          return jsonError(mappedError.message, mappedError.status, mappedError.code);
        }

        effectiveBookId = createdBook.id;
      }
    } else {
      const { data: book, error: bookError } = await supabase
        .from("books")
        .select("id")
        .eq("id", validatedBookId.value)
        .eq("user_id", user.id)
        .maybeSingle();

      if (bookError) {
        console.error("/api/vocabulary book query error:", bookError.message);
        const mappedError = mapSupabaseError(bookError, "Could not verify book access.");
        return jsonError(mappedError.message, mappedError.status, mappedError.code);
      }

      if (!book) {
        return jsonError("Book not found.", 404, "BOOK_NOT_FOUND");
      }
    }

    let resolvedFields: ResolvedVocabularyFields = {
      bookId: effectiveBookId,
      selectedText: validatedSelectedText.value,
      term: validatedTerm.value,
      canonicalUnit: validatedCanonicalUnit.value,
      translation: validatedTranslation.value,
      contextSentence: validatedContextSentence.value,
      unitType: validatedUnitType.value,
      confidence: validatedConfidence.value,
    };

    // The saved item must mirror the persisted translation, not what the client sent.
    // Fase 35 already stored every field the vocabulary row needs.
    if (normalizedBookTranslationId) {
      const translationResult = await getTranslationById(
        supabase,
        user.id,
        normalizedBookTranslationId,
      );

      if (!translationResult.ok) {
        console.error(
          "/api/vocabulary translation lookup error:",
          translationResult.error.message,
        );
        const mappedError = mapSupabaseError(
          translationResult.error,
          "Could not verify the stored translation.",
        );
        return jsonError(mappedError.message, mappedError.status, mappedError.code);
      }

      if (!translationResult.data) {
        // Same answer for "does not exist" and "belongs to another user".
        return jsonError("Translation not found.", 404, "TRANSLATION_NOT_FOUND");
      }

      resolvedFields = resolveFieldsFromTranslation(translationResult.data, resolvedFields);
      effectiveBookId = resolvedFields.bookId;
    }

    // A persistent translation can only produce one vocabulary item.
    if (normalizedBookTranslationId) {
      const { data: existingLinkedItem, error: existingLinkedItemError } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("book_translation_id", normalizedBookTranslationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Ignore 42703: older schemas without the link column fall back to the term check.
      if (existingLinkedItemError && existingLinkedItemError.code !== "42703") {
        console.error(
          "/api/vocabulary linked duplicate check error:",
          existingLinkedItemError.message,
        );
        const mappedError = mapSupabaseError(
          existingLinkedItemError,
          "Could not verify existing vocabulary item.",
        );
        return jsonError(mappedError.message, mappedError.status, mappedError.code);
      }

      if (existingLinkedItem) {
        const linkedPayload: SaveVocabularyResponse = {
          item: existingLinkedItem as VocabularyItem,
          status: "already_exists",
          message: "This item was already saved.",
        };

        return NextResponse.json(linkedPayload);
      }
    }

    // Fallback duplicate check for saves with no persistent translation (onboarding demo,
    // legacy rows). With a link it must not run: a book repeating the same sentence would
    // answer with an item bound to another position, and that highlight would read as
    // saved until the next reload. `book_translation_id` is the authority when present.
    const { data: existingItem, error: existingItemError } = normalizedBookTranslationId
      ? { data: null, error: null }
      : await supabase
          .from("vocabulary_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("book_id", effectiveBookId)
          .eq("term", resolvedFields.term)
          .eq("context_sentence", resolvedFields.contextSentence)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (existingItemError) {
      console.error("/api/vocabulary duplicate check error:", existingItemError.message);
      const mappedError = mapSupabaseError(
        existingItemError,
        "Could not verify existing vocabulary item.",
      );
      return jsonError(mappedError.message, mappedError.status, mappedError.code);
    }

    if (existingItem) {
      const existingPayload: SaveVocabularyResponse = {
        item: existingItem as VocabularyItem,
        status: "already_exists",
        message: "This item was already saved.",
      };

      console.warn("/api/vocabulary duplicate item: " + JSON.stringify(existingItem));

      return NextResponse.json(existingPayload);
    }

    const insertPayload: InsertVocabularyPayload = {
      user_id: user.id,
      book_id: effectiveBookId,
      selected_text: resolvedFields.selectedText,
      term: resolvedFields.term,
      canonical_unit: resolvedFields.canonicalUnit,
      translation: resolvedFields.translation,
      context_sentence: resolvedFields.contextSentence,
      unit_type: resolvedFields.unitType,
      confidence: resolvedFields.confidence,
      status: "saved",
      ...(normalizedBookTranslationId ? { book_translation_id: normalizedBookTranslationId } : {}),
    };

    let savedWithLegacyShape = false;
    let insertError: SupabaseErrorLike | null = null;

    {
      const insertResult = await supabase.from("vocabulary_items").insert(insertPayload);
      insertError = insertResult.error;
    }

    // A concurrent save won the race: reuse its row instead of failing.
    if (insertError?.code === "23505") {
      const concurrentQuery = supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id);

      const { data: concurrentItem } = await (normalizedBookTranslationId
        ? concurrentQuery.eq("book_translation_id", normalizedBookTranslationId)
        : concurrentQuery
            .eq("book_id", effectiveBookId)
            .eq("term", resolvedFields.term)
            .eq("context_sentence", resolvedFields.contextSentence))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (concurrentItem) {
        const concurrentPayload: SaveVocabularyResponse = {
          item: concurrentItem as VocabularyItem,
          status: "already_exists",
          message: "This item was already saved.",
        };

        return NextResponse.json(concurrentPayload);
      }
    }

    // Fallback for schemas without the book_translations link column.
    if (insertError?.code === "42703" && normalizedBookTranslationId) {
      const { book_translation_id: _unusedTranslationLink, ...payloadWithoutLink } = insertPayload;
      void _unusedTranslationLink;

      const unlinkedInsertResult = await supabase
        .from("vocabulary_items")
        .insert(payloadWithoutLink);

      insertError = unlinkedInsertResult.error;
    }

    // Fallback for older schemas that do not yet include canonical/unit/confidence fields.
    if (insertError?.code === "42703") {
      const legacyInsertResult = await supabase.from("vocabulary_items").insert({
        user_id: insertPayload.user_id,
        book_id: insertPayload.book_id,
        term: insertPayload.term,
        translation: insertPayload.translation,
        context_sentence: insertPayload.context_sentence,
        status: insertPayload.status,
      });

      insertError = legacyInsertResult.error;
      savedWithLegacyShape = !legacyInsertResult.error;
    }

    if (insertError) {
      console.error("/api/vocabulary insert error:", insertError.message);
      const mappedError = mapSupabaseError(insertError, "Could not save vocabulary item right now.");
      return jsonError(mappedError.message, mappedError.status, mappedError.code);
    }

    // The link identifies the new row exactly; without it fall back to term + translation.
    const readBackQuery = supabase.from("vocabulary_items").select("*").eq("user_id", user.id);

    const { data: insertedItem, error: readBackError } = await (normalizedBookTranslationId
      ? readBackQuery.eq("book_translation_id", normalizedBookTranslationId)
      : readBackQuery
          .eq("book_id", effectiveBookId)
          .eq("term", resolvedFields.term)
          .eq("translation", resolvedFields.translation))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readBackError) {
      console.error("/api/vocabulary read back error:", readBackError.message);
    }

    const payload: SaveVocabularyResponse = {
      item:
        (insertedItem as VocabularyItem | null) ??
        buildFallbackVocabularyItem(insertPayload, savedWithLegacyShape),
      status: "created",
      message: "Saved.",
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("/api/vocabulary unexpected error:", error);
    return jsonError("Could not save vocabulary item right now.", 500);
  }
}