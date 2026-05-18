import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { VocabularyItem, SaveVocabularyRequest } from "@/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: Partial<SaveVocabularyRequest>;

  try {
    body = (await request.json()) as Partial<SaveVocabularyRequest>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const bookId = body.bookId;
  const selectedText = body.selectedText;
  const term = body.term;
  const canonicalUnit = body.canonicalUnit;
  const translation = body.translation;
  const contextSentence = body.contextSentence;
  const unitType = body.unitType || "phrase";
  const confidence = body.confidence || "medium";

  if (
    !bookId ||
    !selectedText ||
    !term ||
    !canonicalUnit ||
    !translation ||
    !contextSentence
  ) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("vocabulary_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .eq("canonical_unit", canonicalUnit)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        ok: true,
        item: existing as VocabularyItem,
        status: "already_exists" as const,
        message: "Already saved",
      },
      { status: 200 },
    );
  }

  const { data: newItem, error: insertError } = await supabase
    .from("vocabulary_items")
    .insert({
      user_id: user.id,
      book_id: bookId,
      selected_text: selectedText,
      term,
      canonical_unit: canonicalUnit,
      translation,
      context_sentence: contextSentence,
      unit_type: unitType,
      confidence,
      status: "saved",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: "Could not save vocabulary" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      item: newItem as VocabularyItem,
      status: "created" as const,
      message: "Saved",
    },
    { status: 201 },
  );
}
