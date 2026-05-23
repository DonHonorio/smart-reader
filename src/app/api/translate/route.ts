import { NextResponse } from "next/server";
import { translateWithAI } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import type { TranslateRequestBody } from "@/types";
const MAX_SELECTED_TEXT_LENGTH = 300;
const SELECTED_TEXT_TOO_LONG_ERROR =
  "Selected text is too long. Please select a shorter word or phrase.";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Unauthorized", 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const {
    selectedText,
    contextSentence,
    sourceLanguage,
    targetLanguage,
  } = (body ?? {}) as Partial<TranslateRequestBody>;

  if (typeof selectedText !== "string") {
    return jsonError("selectedText is required.", 400);
  }

  if (selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
    return jsonError(SELECTED_TEXT_TOO_LONG_ERROR, 400);
  }

  const normalizedSelectedText = normalizeText(selectedText);

  if (!normalizedSelectedText) {
    return jsonError("selectedText is required.", 400);
  }

  let normalizedContextSentence: string | null = null;

  if (contextSentence !== null && contextSentence !== undefined) {
    if (typeof contextSentence !== "string") {
      return jsonError("contextSentence must be a string or null.", 400);
    }

    normalizedContextSentence = normalizeText(contextSentence);

    if (normalizedContextSentence.length > 1500) {
      return jsonError("contextSentence is too long.", 400);
    }

    if (!normalizedContextSentence) {
      normalizedContextSentence = null;
    }
  }

  if (typeof sourceLanguage !== "string" || !sourceLanguage.trim()) {
    return jsonError("sourceLanguage is required.", 400);
  }

  if (typeof targetLanguage !== "string" || !targetLanguage.trim()) {
    return jsonError("targetLanguage is required.", 400);
  }

  try {
    const response = await translateWithAI({
      selectedText: normalizedSelectedText,
      contextSentence: normalizedContextSentence,
      sourceLanguage: sourceLanguage.trim(),
      targetLanguage: targetLanguage.trim(),
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing ")) {
      console.error(error.message);
      return jsonError("Translation service is temporarily unavailable.", 500);
    }

    console.error("/api/translate error:", error);
    return jsonError("Could not translate text right now.", 500);
  }
}
