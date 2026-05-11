import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  TranslateRequestBody,
  TranslateResponse,
  TranslationUnitType,
} from "@/types";

const MODEL_NAME = process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-4o-mini";
const MAX_SELECTED_TEXT_LENGTH = 300;
const SELECTED_TEXT_TOO_LONG_ERROR =
  "Selected text is too long. Please select a shorter word or phrase.";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isTranslationUnitType(value: unknown): value is TranslationUnitType {
  return (
    value === "single_word" ||
    value === "phrasal_verb" ||
    value === "idiom" ||
    value === "collocation" ||
    value === "phrase"
  );
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

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY.");
    return jsonError("Translation service is temporarily unavailable.", 500);
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      temperature: 0,
      max_tokens: 150,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a precise contextual dictionary for language learners.",
            "selectedText is an anchor, not always the final translation unit.",
            "Find the minimal translatable unit in context that contains or depends on selectedText.",
            "If selectedText is part of a phrasal verb, idiom, collocation, or fixed expression, expand to the full unit.",
            "If selectedText works alone, do not expand.",
            "Never translate the full context sentence unless strictly necessary.",
            "Return valid JSON only.",
            "No markdown.",
            "No explanation text outside JSON.",
            "JSON schema:",
            '{"selectedText":"string","translationUnit":"string","translation":"string","isExpanded":boolean,"unitType":"single_word|phrasal_verb|idiom|collocation|phrase"}',
            "",
            "Example 1:",
            'selectedText: "look"',
            'contextSentence: "I look after my dog."',
            'Expected JSON: {"selectedText":"look","translationUnit":"look after","translation":"cuidar","isExpanded":true,"unitType":"phrasal_verb"}',
            "",
            "Example 2:",
            'selectedText: "after"',
            'contextSentence: "I look after my dog."',
            'Expected JSON: {"selectedText":"after","translationUnit":"look after","translation":"cuidar","isExpanded":true,"unitType":"phrasal_verb"}',
            "",
            "Example 3:",
            'selectedText: "weather"',
            'contextSentence: "I\'m feeling a bit under the weather today."',
            'Expected JSON: {"selectedText":"weather","translationUnit":"under the weather","translation":"sentirse mal","isExpanded":true,"unitType":"idiom"}',
            "",
            "Example 4:",
            'selectedText: "dog"',
            'contextSentence: "I look after my dog."',
            'Expected JSON: {"selectedText":"dog","translationUnit":"dog","translation":"perro","isExpanded":false,"unitType":"single_word"}',
            "",
            "Example 5:",
            'selectedText: "OUTWITS"',
            'contextSentence: "DESIRE OUTWITS MOTHER NATURE"',
            'Expected JSON: {"selectedText":"OUTWITS","translationUnit":"OUTWITS","translation":"supera en astucia","isExpanded":false,"unitType":"single_word"}',
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Source language: ${sourceLanguage.trim()}`,
            `Target language: ${targetLanguage.trim()}`,
            "",
            "selectedText is an anchor.",
            "Translate the minimal meaningful unit in context.",
            "Translate only the text inside <selected_text>.",
            "Do not translate <context_sentence>.",
            "Do not translate the full context sentence.",
            "",
            `<selected_text>${normalizedSelectedText}</selected_text>`,
            normalizedContextSentence
              ? `<context_sentence>${normalizedContextSentence}</context_sentence>`
              : "<context_sentence>none</context_sentence>",
          ].join("\n"),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Empty translation response.");
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Invalid JSON translation response.");
    }

    const parsedObject = (parsed ?? {}) as {
      translationUnit?: unknown;
      translation?: unknown;
      isExpanded?: unknown;
      unitType?: unknown;
    };

    const translationUnit =
      typeof parsedObject.translationUnit === "string"
        ? normalizeText(parsedObject.translationUnit)
        : "";
    const translation =
      typeof parsedObject.translation === "string" ? normalizeText(parsedObject.translation) : "";

    if (!translationUnit || !translation) {
      throw new Error("Missing translationUnit or translation.");
    }

    if (!isTranslationUnitType(parsedObject.unitType)) {
      throw new Error("Invalid unitType.");
    }

    if (typeof parsedObject.isExpanded !== "boolean") {
      throw new Error("Invalid isExpanded.");
    }

    const unitType: TranslationUnitType = parsedObject.unitType;

    const inferredIsExpanded =
      normalizeText(translationUnit).toLowerCase() !== normalizeText(normalizedSelectedText).toLowerCase();
    const isExpanded = parsedObject.isExpanded !== inferredIsExpanded ? inferredIsExpanded : parsedObject.isExpanded;

    const response: TranslateResponse = {
      selectedText: normalizedSelectedText,
      translationUnit,
      translation,
      isExpanded,
      unitType,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("/api/translate error:", error);
    return jsonError("Could not translate text right now.", 500);
  }
}
