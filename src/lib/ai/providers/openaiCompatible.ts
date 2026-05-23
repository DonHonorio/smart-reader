import OpenAI from "openai";
import type { TranslationPrompt, AIAdapterResponse, AIProvider } from "@/lib/ai/types";

type OpenAICompatibleProvider = Exclude<AIProvider, "google">;

type OpenAICompatibleRequest = {
  provider: OpenAICompatibleProvider;
  apiKey: string;
  model: string;
  prompt: TranslationPrompt;
  baseURL?: string;
};

const DEFAULT_MAX_TOKENS = 280;
const REASONER_MAX_TOKENS = 900;
const GLM_MAX_TOKENS = 220;
const GLM_RETRY_MAX_TOKENS = 420;

function isDeepSeekReasoner(request: OpenAICompatibleRequest) {
  return request.provider === "deepseek" && request.model.toLowerCase().includes("reasoner");
}

function isDeepInfraGlm(request: OpenAICompatibleRequest) {
  return request.provider === "deepinfra" && request.model.toLowerCase().includes("glm-4.7");
}

function extractContentFromMessage(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const textContent = content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      const maybeText = (item as { text?: unknown } | undefined)?.text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .join("\n")
    .trim();

  return textContent;
}

function extractReasoningContentFromMessage(message: unknown): string {
  const reasoningContent = (message as { reasoning_content?: unknown } | undefined)?.reasoning_content;

  if (typeof reasoningContent === "string") {
    return reasoningContent.trim();
  }

  if (!Array.isArray(reasoningContent)) {
    return "";
  }

  return reasoningContent
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      const maybeText = (item as { text?: unknown } | undefined)?.text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .join("\n")
    .trim();
}

async function requestCompletion(
  client: OpenAI,
  request: OpenAICompatibleRequest,
  options: {
    includeJsonMode: boolean;
    maxTokens: number;
    appendJsonReminder?: boolean;
    enforceNoReasoning?: boolean;
  },
) {
  const userContent = options.appendJsonReminder
    ? `${request.prompt.user}\n\nReturn one compact JSON object only. No markdown.${
        options.enforceNoReasoning ? " No reasoning, no step-by-step analysis, no extra fields." : ""
      }`
    : request.prompt.user;

  const systemContent = options.enforceNoReasoning
    ? `${request.prompt.system}\n\nOutput only final JSON. Do not include reasoning traces.`
    : request.prompt.system;

  const payload: {
    model: string;
    temperature: number;
    max_tokens: number;
    messages: Array<{
      role: "system" | "user";
      content: string;
    }>;
    response_format?: {
      type: "json_object";
    };
  } = {
    model: request.model,
    temperature: 0,
    max_tokens: options.maxTokens,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  };

  if (options.includeJsonMode) {
    payload.response_format = { type: "json_object" };
  }

  return client.chat.completions.create(payload);
}

export async function translateWithOpenAICompatible(
  request: OpenAICompatibleRequest,
): Promise<AIAdapterResponse> {
  const client = new OpenAI({
    apiKey: request.apiKey,
    baseURL: request.baseURL,
  });

  const shouldSkipJsonMode = isDeepSeekReasoner(request);
  const shouldUseGlmProfile = isDeepInfraGlm(request);
  const maxTokens = shouldSkipJsonMode
    ? REASONER_MAX_TOKENS
    : shouldUseGlmProfile
      ? GLM_MAX_TOKENS
      : DEFAULT_MAX_TOKENS;

  let completion;

  if (shouldSkipJsonMode) {
    completion = await requestCompletion(client, request, {
      includeJsonMode: false,
      maxTokens,
    });
  } else if (shouldUseGlmProfile) {
    completion = await requestCompletion(client, request, {
      includeJsonMode: false,
      maxTokens: GLM_MAX_TOKENS,
      appendJsonReminder: true,
      enforceNoReasoning: true,
    });
  } else {
    try {
      completion = await requestCompletion(client, request, {
        includeJsonMode: true,
        maxTokens,
      });
    } catch (error) {
      // Some OpenAI-compatible providers do not support response_format json_object.
      if (request.provider === "openai") {
        throw error;
      }

      completion = await requestCompletion(client, request, {
        includeJsonMode: false,
        maxTokens,
      });
    }
  }

  let content = extractContentFromMessage(completion.choices[0]?.message);

  if (!content && shouldSkipJsonMode) {
    // DeepSeek reasoner may return no final text in short outputs; retry with explicit JSON reminder.
    const retryCompletion = await requestCompletion(client, request, {
      includeJsonMode: false,
      maxTokens: REASONER_MAX_TOKENS,
      appendJsonReminder: true,
    });
    content = extractContentFromMessage(retryCompletion.choices[0]?.message);
  }

  if (!content && shouldUseGlmProfile) {
    content = extractReasoningContentFromMessage(completion.choices[0]?.message);
  }

  if (!content && shouldUseGlmProfile) {
    const retryCompletion = await requestCompletion(client, request, {
      includeJsonMode: false,
      maxTokens: GLM_RETRY_MAX_TOKENS,
      appendJsonReminder: true,
      enforceNoReasoning: true,
    });
    content = extractContentFromMessage(retryCompletion.choices[0]?.message);

    if (!content) {
      content = extractReasoningContentFromMessage(retryCompletion.choices[0]?.message);
    }
  }

  if (!content) {
    throw new Error("Empty translation response.");
  }

  return {
    provider: request.provider,
    actualModel: request.model,
    content,
  };
}
