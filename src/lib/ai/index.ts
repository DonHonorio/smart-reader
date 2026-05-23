import {
  resolveGeminiConfig,
  resolveModelCandidates,
  resolveOpenAICompatibleConfig,
  resolveProvider,
} from "@/lib/ai/config";
import { buildTranslationPrompt, normalizeText } from "@/lib/ai/prompt";
import { translateWithDeepInfraNative } from "@/lib/ai/providers/deepinfraNative";
import { translateWithGemini } from "@/lib/ai/providers/googleGemini";
import { translateWithOpenAICompatible } from "@/lib/ai/providers/openaiCompatible";
import type { InternalTranslationResponse, TranslateWithAIInput } from "@/lib/ai/types";
import type { TranslationUnitType } from "@/types";

const SUPPORTED_UNIT_TYPES = ["single_word", "phrasal_verb", "idiom", "collocation", "phrase"] as const;

function isTranslationUnitType(value: unknown): value is TranslationUnitType {
  return typeof value === "string" && SUPPORTED_UNIT_TYPES.includes(value as (typeof SUPPORTED_UNIT_TYPES)[number]);
}

function stripCodeFence(value: string) {
  if (!value.startsWith("```")) {
    return value;
  }

  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizeJsonLikeText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^json\s*/i, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function tryParseJsonCandidate(value: string): unknown | null {
  const attempts = [
    value,
    normalizeJsonLikeText(value),
    value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : "",
    value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : "",
  ].filter(Boolean);

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);

      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch {
          return parsed;
        }
      }

      return parsed;
    } catch {
      // Continue trying candidates.
    }

    const singleQuoteFixed = attempt
      .replace(/([{,]\s*)'([^'\\]+?)'\s*:/g, '$1"$2":')
      .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'(\s*[,}])/g, (_match, valuePart, tail) => {
        const escapedValue = String(valuePart).replace(/"/g, '\\"');
        return `: "${escapedValue}"${tail}`;
      });

    if (singleQuoteFixed === attempt) {
      continue;
    }

    try {
      return JSON.parse(singleQuoteFixed);
    } catch {
      // Continue trying candidates.
    }
  }

  return null;
}

function parseTextFallback(content: string): unknown | null {
  const boolMatch = content.match(/(?:"isExpanded"|isExpanded)\s*:\s*(true|false)/i);
  const unitTypeMatch = content.match(
    /(?:"unitType"|unitType)\s*:\s*["']?(single_word|phrasal_verb|idiom|collocation|phrase)["']?/i,
  );
  const translationUnitMatch =
    content.match(/(?:"translationUnit"|translationUnit)\s*:\s*"([^"]+)"/i) ??
    content.match(/(?:"translationUnit"|translationUnit)\s*:\s*([^\n\r,}]+)/i);
  const translationMatch =
    content.match(/(?:"translation"|translation)\s*:\s*"([^"]+)"/i) ??
    content.match(/(?:"translation"|translation)\s*:\s*([^\n\r,}]+)/i);

  if (!translationUnitMatch || !translationMatch) {
    return null;
  }

  const parsedFallback: {
    translationUnit: string;
    translation: string;
    isExpanded?: boolean;
    unitType?: string;
  } = {
    translationUnit: translationUnitMatch[1].trim().replace(/^['"]|['"]$/g, ""),
    translation: translationMatch[1].trim().replace(/^['"]|['"]$/g, ""),
  };

  if (boolMatch) {
    parsedFallback.isExpanded = boolMatch[1].toLowerCase() === "true";
  }

  if (unitTypeMatch) {
    parsedFallback.unitType = unitTypeMatch[1].toLowerCase();
  }

  return parsedFallback;
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();

  const stripped = stripCodeFence(trimmed);
  const extractedFromTrimmed = extractFirstJsonObject(trimmed);
  const extractedFromStripped = extractFirstJsonObject(stripped);
  const candidates = [trimmed, stripped, extractedFromTrimmed, extractedFromStripped].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of Array.from(new Set(candidates))) {
    const parsed = tryParseJsonCandidate(candidate);

    if (parsed !== null) {
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0];
      }

      return parsed;
    }
  }

  const fallbackParsed = parseTextFallback(stripped);

  if (fallbackParsed !== null) {
    return fallbackParsed;
  }

  throw new Error("Invalid JSON translation response.");
}

function buildTranslationResponse(parsed: unknown, selectedText: string): InternalTranslationResponse {
  const parsedObject = (parsed ?? {}) as {
    translationUnit?: unknown;
    translation?: unknown;
    isExpanded?: unknown;
    unitType?: unknown;
  };

  const translationUnit =
    typeof parsedObject.translationUnit === "string" ? normalizeText(parsedObject.translationUnit) : "";
  const translation = typeof parsedObject.translation === "string" ? normalizeText(parsedObject.translation) : "";

  if (!translationUnit || !translation) {
    throw new Error("Missing translationUnit or translation.");
  }

  const inferredIsExpanded = normalizeText(translationUnit).toLowerCase() !== normalizeText(selectedText).toLowerCase();
  const isExpanded =
    typeof parsedObject.isExpanded === "boolean"
      ? parsedObject.isExpanded !== inferredIsExpanded
        ? inferredIsExpanded
        : parsedObject.isExpanded
      : inferredIsExpanded;
  const unitType = isTranslationUnitType(parsedObject.unitType)
    ? parsedObject.unitType
    : isExpanded
      ? "phrase"
      : "single_word";

  return {
    selectedText,
    translationUnit,
    translation,
    isExpanded,
    unitType,
  };
}

function debugTranslationRequest(provider: string, actualModel: string) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[ai.translate] final request", {
    provider,
    actualModel,
  });
}

function debugModelFallback(provider: string, requestedModel: string, fallbackModel: string) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[ai.translate] retrying with fallback model", {
    provider,
    requestedModel,
    fallbackModel,
  });
}

function debugInvalidJsonResponse(provider: string, actualModel: string, content: string) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[ai.translate] invalid json preview", {
    provider,
    actualModel,
    preview: content.slice(0, 800),
  });
}

function shouldRetryWithModelFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const lowerMessage = error.message.toLowerCase();

  return (
    lowerMessage.includes("model_not_available") ||
    lowerMessage.includes("model_not_found") ||
    lowerMessage.includes("unable to access model") ||
    lowerMessage.includes("unable to access non-serverless model")
  );
}

export async function translateWithAI(input: TranslateWithAIInput): Promise<InternalTranslationResponse> {
  const selectedText = normalizeText(input.selectedText);
  const contextSentence = input.contextSentence ? normalizeText(input.contextSentence) : null;
  const prompt = buildTranslationPrompt({
    ...input,
    selectedText,
    contextSentence,
  });
  const provider = resolveProvider();

  if (provider === "google") {
    const config = resolveGeminiConfig();
    debugTranslationRequest(config.provider, config.model);

    const result = await translateWithGemini({
      apiKey: config.apiKey,
      model: config.model,
      prompt,
      baseURL: config.baseURL,
    });

    let parsed: unknown;

    try {
      parsed = parseJsonContent(result.content);
    } catch {
      debugInvalidJsonResponse(result.provider, result.actualModel, result.content);

      const retryPrompt = {
        system: `${prompt.system}\n\nReturn strict JSON only, complete all required keys, and close the object properly.`,
        user: `${prompt.user}\n\nReturn one single minified JSON object. No markdown. No prose.`,
      };

      const retryResult = await translateWithGemini({
        apiKey: config.apiKey,
        model: config.model,
        prompt: retryPrompt,
        baseURL: config.baseURL,
      });

      try {
        parsed = parseJsonContent(retryResult.content);
      } catch {
        debugInvalidJsonResponse(retryResult.provider, retryResult.actualModel, retryResult.content);
        throw new Error("Invalid JSON translation response.");
      }
    }

    return buildTranslationResponse(parsed, selectedText);
  }

  const config = resolveOpenAICompatibleConfig(provider);
  const modelCandidates = resolveModelCandidates(config.provider, config.model);

  let lastError: unknown = null;

  for (const [index, modelCandidate] of modelCandidates.entries()) {
    debugTranslationRequest(config.provider, modelCandidate);

    try {
      const isDeepInfraGlmCandidate =
        config.provider === "deepinfra" && modelCandidate.toLowerCase().includes("glm-4.7");

      const result = isDeepInfraGlmCandidate
        ? await translateWithDeepInfraNative({
            apiKey: config.apiKey,
            model: modelCandidate,
            prompt,
            baseURL: config.baseURL,
          })
        : await translateWithOpenAICompatible({
            provider: config.provider,
            apiKey: config.apiKey,
            model: modelCandidate,
            prompt,
            baseURL: config.baseURL,
          });

      let parsed: unknown;

      try {
        parsed = parseJsonContent(result.content);
      } catch {
        debugInvalidJsonResponse(result.provider, result.actualModel, result.content);
        throw new Error("Invalid JSON translation response.");
      }

      return buildTranslationResponse(parsed, selectedText);
    } catch (error) {
      lastError = error;
      const hasNextCandidate = index < modelCandidates.length - 1;

      if (!hasNextCandidate || !shouldRetryWithModelFallback(error)) {
        throw error;
      }

      const fallbackModel = modelCandidates[index + 1];
      debugModelFallback(config.provider, modelCandidate, fallbackModel);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not translate text right now.");
}
