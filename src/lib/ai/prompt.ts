import type { TranslateWithAIInput, TranslationPrompt } from "@/lib/ai/types";

export function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildTranslationPrompt(input: TranslateWithAIInput): TranslationPrompt {
  const selectedText = normalizeText(input.selectedText);
  const contextSentence = input.contextSentence ? normalizeText(input.contextSentence) : null;
  const sourceLanguage = input.sourceLanguage.trim();
  const targetLanguage = input.targetLanguage.trim();

  return {
    system: [
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
    user: [
      `Source language: ${sourceLanguage}`,
      `Target language: ${targetLanguage}`,
      "",
      "selectedText is an anchor.",
      "Translate the minimal meaningful unit in context.",
      "Translate only the text inside <selected_text>.",
      "Do not translate <context_sentence>.",
      "Do not translate the full context sentence.",
      "",
      `<selected_text>${selectedText}</selected_text>`,
      contextSentence
        ? `<context_sentence>${contextSentence}</context_sentence>`
        : "<context_sentence>none</context_sentence>",
    ].join("\n"),
  };
}
