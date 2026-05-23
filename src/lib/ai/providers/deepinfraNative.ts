import type { AIAdapterResponse, TranslationPrompt } from "@/lib/ai/types";

type DeepInfraNativeRequest = {
  apiKey: string;
  model: string;
  prompt: TranslationPrompt;
  baseURL?: string;
};

type DeepInfraNativeResponse = {
  results?: Array<{
    generated_text?: string;
  }>;
};

const DEFAULT_DEEPINFRA_BASE = "https://api.deepinfra.com";
const DEFAULT_MAX_NEW_TOKENS = 220;
const STOP_TOKENS = ["<|endoftext|>", "<|user|>", "<|observation|>"];

function resolveDeepInfraBase(baseURL?: string) {
  const normalized = baseURL?.trim();

  if (!normalized) {
    return DEFAULT_DEEPINFRA_BASE;
  }

  const withoutTrailingSlash = normalized.replace(/\/+$/, "");

  if (withoutTrailingSlash.endsWith("/v1/openai")) {
    const stripped = withoutTrailingSlash.slice(0, -"/v1/openai".length);
    return stripped || DEFAULT_DEEPINFRA_BASE;
  }

  if (withoutTrailingSlash.endsWith("/openai")) {
    const stripped = withoutTrailingSlash.slice(0, -"/openai".length);
    return stripped || DEFAULT_DEEPINFRA_BASE;
  }

  if (withoutTrailingSlash.endsWith("/v1")) {
    const stripped = withoutTrailingSlash.slice(0, -"/v1".length);
    return stripped || DEFAULT_DEEPINFRA_BASE;
  }

  return withoutTrailingSlash;
}

function buildNativeInput(prompt: TranslationPrompt) {
  return [
    "[gMASK]<sop>",
    `<|system|>${prompt.system}\nReturn one minified JSON object only.`,
    `<|user|>${prompt.user}\nReturn compact JSON now.`,
    "<|assistant|>",
  ].join("");
}

export async function translateWithDeepInfraNative(
  request: DeepInfraNativeRequest,
): Promise<AIAdapterResponse> {
  const base = resolveDeepInfraBase(request.baseURL);
  const endpoint = `${base}/v1/inference/${encodeURIComponent(request.model)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: buildNativeInput(request.prompt),
      stream: false,
      temperature: 0,
      max_new_tokens: DEFAULT_MAX_NEW_TOKENS,
      stop: STOP_TOKENS,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`DeepInfra native request failed (${response.status}): ${details.slice(0, 400)}`);
  }

  const data = (await response.json()) as DeepInfraNativeResponse;
  const content = data.results?.[0]?.generated_text?.trim() ?? "";

  if (!content) {
    throw new Error("Empty translation response.");
  }

  return {
    provider: "deepinfra",
    actualModel: request.model,
    content,
  };
}
