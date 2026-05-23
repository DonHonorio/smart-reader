import type { AIAdapterResponse, TranslationPrompt } from "@/lib/ai/types";

type GeminiRequest = {
  apiKey: string;
  model: string;
  prompt: TranslationPrompt;
  baseURL: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const GEMINI_API_VERSION = "v1beta";
const GEMINI_MAX_OUTPUT_TOKENS = 600;

export async function translateWithGemini(request: GeminiRequest): Promise<AIAdapterResponse> {
  const endpoint = `${request.baseURL}/${GEMINI_API_VERSION}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            selectedText: { type: "STRING" },
            translationUnit: { type: "STRING" },
            translation: { type: "STRING" },
            isExpanded: { type: "BOOLEAN" },
            unitType: {
              type: "STRING",
              enum: ["single_word", "phrasal_verb", "idiom", "collocation", "phrase"],
            },
          },
          required: ["selectedText", "translationUnit", "translation", "isExpanded", "unitType"],
        },
      },
      systemInstruction: {
        parts: [{ text: request.prompt.system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: request.prompt.user }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${details.slice(0, 400)}`);
  }

  const data = (await response.json()) as GeminiGenerateContentResponse;
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const content = parts
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (!content) {
    throw new Error("Empty translation response.");
  }

  return {
    provider: "google",
    actualModel: request.model,
    content,
  };
}
