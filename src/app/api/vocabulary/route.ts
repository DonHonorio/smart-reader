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
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function jsonError(message: string, status: number) {
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
    updated_at: now,
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
      response: jsonError(`${fieldName} is required.`, 400),
    };
  }

  const normalized = normalizeText(value);

  if (!normalized) {
    return {
      ok: false,
      response: jsonError(`${fieldName} is required.`, 400),
    };
  }

  if (normalized.length > maxLength) {
    return {
      ok: false,
      response: jsonError(`${fieldName} is too long.`, 400),
    };
  }

  return { ok: true, value: normalized };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
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
  } = (body ?? {}) as Partial<SaveVocabularyRequest>;

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

  const validatedContextSentence = validateRequiredString(contextSentence, "contextSentence", 1500);

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

    const insertPayload: InsertVocabularyPayload = {
      user_id: user.id,
      book_id: validatedBookId.value,
      selected_text: validatedSelectedText.value,
      term: validatedTerm.value,
      canonical_unit: validatedCanonicalUnit.value,
      translation: validatedTranslation.value,
      context_sentence: validatedContextSentence.value,
      unit_type: validatedUnitType.value,
      confidence: validatedConfidence.value,
      status: "saved",
    };

    let savedWithLegacyShape = false;
    let insertError: SupabaseErrorLike | null = null;

    {
      const insertResult = await supabase.from("vocabulary_items").insert(insertPayload);
      insertError = insertResult.error;
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
      .eq("book_id", validatedBookId.value)
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
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("/api/vocabulary unexpected error:", error);
    return jsonError("Could not save vocabulary item right now.", 500);
  }
}