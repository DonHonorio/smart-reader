import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
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

function jsonError(message: string, status: number, debugContext?: Record<string, unknown>) {
  if (status === 400) {
    console.warn("/api/vocabulary bad request:", {
      message,
      ...debugContext,
    });
  }

  return NextResponse.json({ error: message }, { status });
}

function mapSupabaseError(
  error: SupabaseErrorLike | null | undefined,
  fallbackMessage: string,
): { status: number; message: string } {
  if (!error?.code) {
    return { status: 500, message: fallbackMessage };
  }

  if (error.code === "42501") {
    return {
      status: 403,
      message: "Not allowed to save vocabulary for this user.",
    };
  }

  if (error.code === "23503") {
    return {
      status: 404,
      message: "Book not found.",
    };
  }

  if (error.code === "23505") {
    return {
      status: 409,
      message: "This vocabulary item is already saved.",
    };
  }

  if (error.code === "42P01") {
    return {
      status: 500,
      message: "The vocabulary_items table is not available.",
    };
  }

  if (error.code === "42703") {
    return {
      status: 500,
      message: "The vocabulary_items table schema is missing expected columns.",
    };
  }

  return { status: 500, message: fallbackMessage };
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
      response: jsonError(`${fieldName} is required.`, 400, {
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
      response: jsonError(`${fieldName} is required.`, 400, {
        reason: "required_empty",
        fieldName,
      }),
    };
  }

  if (normalized.length > maxLength) {
    return {
      ok: false,
      response: jsonError(`${fieldName} is too long.`, 400, {
        reason: "max_length_exceeded",
        fieldName,
        maxLength,
        actualLength: normalized.length,
      }),
    };
  }

  return { ok: true, value: normalized };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("Authentication required.", 401);
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
      return jsonError(mappedError.message, mappedError.status);
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
    return jsonError("Invalid request body.", 400, {
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
      return jsonError("Authentication required.", 401);
    }

    if (!user) {
      return jsonError("Authentication required.", 401);
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
        return jsonError(mappedError.message, mappedError.status);
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
          return jsonError(mappedError.message, mappedError.status);
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
        return jsonError(mappedError.message, mappedError.status);
      }

      if (!book) {
        return jsonError("Book not found.", 404);
      }
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
        return jsonError(mappedError.message, mappedError.status);
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

    const { data: existingItem, error: existingItemError } = await supabase
      .from("vocabulary_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("book_id", effectiveBookId)
      .eq("term", validatedTerm.value)
      .eq("context_sentence", validatedContextSentence.value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingItemError) {
      console.error("/api/vocabulary duplicate check error:", existingItemError.message);
      const mappedError = mapSupabaseError(
        existingItemError,
        "Could not verify existing vocabulary item.",
      );
      return jsonError(mappedError.message, mappedError.status);
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
      selected_text: validatedSelectedText.value,
      term: validatedTerm.value,
      canonical_unit: validatedCanonicalUnit.value,
      translation: validatedTranslation.value,
      context_sentence: validatedContextSentence.value,
      unit_type: validatedUnitType.value,
      confidence: validatedConfidence.value,
      status: "saved",
      ...(normalizedBookTranslationId ? { book_translation_id: normalizedBookTranslationId } : {}),
    };

    let savedWithLegacyShape = false;
    let insertError: SupabaseErrorLike | null = null;

    {
      const insertResult = await supabase.from("vocabulary_items").insert(insertPayload);
      insertError = insertResult.error;
    }

    // A concurrent save already linked this translation: reuse it instead of failing.
    if (insertError?.code === "23505" && normalizedBookTranslationId) {
      const { data: concurrentItem } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("book_translation_id", normalizedBookTranslationId)
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
      return jsonError(mappedError.message, mappedError.status);
    }

    const { data: insertedItem, error: readBackError } = await supabase
      .from("vocabulary_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("book_id", effectiveBookId)
      .eq("term", validatedTerm.value)
      .eq("translation", validatedTranslation.value)
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