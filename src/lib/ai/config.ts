import type { AIProvider } from "@/lib/ai/types";

type ProviderConfig = {
  provider: AIProvider;
  model: string;
};

type OpenAICompatibleProvider = Exclude<AIProvider, "google">;

type OpenAICompatibleConfig = ProviderConfig & {
  provider: OpenAICompatibleProvider;
  apiKey: string;
  baseURL?: string;
};

type GeminiConfig = ProviderConfig & {
  provider: "google";
  apiKey: string;
  baseURL: string;
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
  together: "Qwen/Qwen2.5-7B-Instruct-Turbo",
  deepinfra: "Qwen/Qwen2.5-72B-Instruct",
  deepseek: "deepseek-chat",
};

function sanitizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function throwMissingEnv(varName: string, provider: AIProvider): never {
  throw new Error(`Missing ${varName} for AI provider \"${provider}\".`);
}

export function resolveProvider(): AIProvider {
  const rawProvider = sanitizeEnvValue(process.env.AI_PROVIDER)?.toLowerCase();

  if (
    rawProvider === "openai" ||
    rawProvider === "google" ||
    rawProvider === "together" ||
    rawProvider === "deepinfra" ||
    rawProvider === "deepseek"
  ) {
    return rawProvider;
  }

  return "openai";
}

export function resolveModel(provider: AIProvider): string {
  const modelFromEnv = sanitizeEnvValue(process.env.AI_TRANSLATION_MODEL);

  if (modelFromEnv) {
    return modelFromEnv;
  }

  if (provider === "openai") {
    const legacyModel = sanitizeEnvValue(process.env.OPENAI_TRANSLATION_MODEL);

    if (legacyModel) {
      return legacyModel;
    }
  }

  return DEFAULT_MODELS[provider];
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

export function resolveModelCandidates(provider: AIProvider, model: string): string[] {
  if (provider === "together") {
    if (model === "Qwen/Qwen2.5-72B-Instruct") {
      return uniqueValues([
        model,
        "Qwen/Qwen2.5-72B-Instruct-Turbo",
        "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        "Qwen/Qwen2.5-7B-Instruct-Turbo",
      ]);
    }

    if (model === "Qwen/Qwen2.5-72B-Instruct-Turbo") {
      return uniqueValues([model, "Qwen/Qwen2.5-7B-Instruct-Turbo"]);
    }

    if (model === "CohereForAI/aya-expanse-32b") {
      return uniqueValues([
        model,
        "CohereForAI/aya-expanse-8b",
        "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        "Qwen/Qwen2.5-7B-Instruct-Turbo",
      ]);
    }

    if (model === "CohereForAI/aya-expanse-8b") {
      return uniqueValues([model, "Qwen/Qwen2.5-7B-Instruct-Turbo"]);
    }

    if (model === "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo") {
      return uniqueValues([model, "Qwen/Qwen2.5-7B-Instruct-Turbo"]);
    }

    if (model === "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo") {
      return uniqueValues([model, "Qwen/Qwen2.5-7B-Instruct-Turbo"]);
    }

    return uniqueValues([model, "Qwen/Qwen2.5-7B-Instruct-Turbo"]);
  }

  if (provider === "deepinfra") {
    if (model === "CohereForAI/aya-expanse-32b" || model === "CohereForAI/aya-expanse-8b") {
      return ["Qwen/Qwen2.5-72B-Instruct"];
    }

    return [model];
  }

  return [model];
}

export function resolveOpenAICompatibleConfig(provider: OpenAICompatibleProvider): OpenAICompatibleConfig {
  const model = resolveModel(provider);

  if (provider === "openai") {
    const apiKey = sanitizeEnvValue(process.env.OPENAI_API_KEY);

    if (!apiKey) {
      throwMissingEnv("OPENAI_API_KEY", provider);
    }

    return {
      provider,
      model,
      apiKey,
    };
  }

  if (provider === "together") {
    const apiKey = sanitizeEnvValue(process.env.TOGETHER_API_KEY);

    if (!apiKey) {
      throwMissingEnv("TOGETHER_API_KEY", provider);
    }

    return {
      provider,
      model,
      apiKey,
      baseURL: sanitizeEnvValue(process.env.TOGETHER_BASE_URL) ?? "https://api.together.xyz/v1",
    };
  }

  if (provider === "deepinfra") {
    const apiKey = sanitizeEnvValue(process.env.DEEPINFRA_API_KEY);

    if (!apiKey) {
      throwMissingEnv("DEEPINFRA_API_KEY", provider);
    }

    return {
      provider,
      model,
      apiKey,
      baseURL: sanitizeEnvValue(process.env.DEEPINFRA_BASE_URL) ?? "https://api.deepinfra.com/v1/openai",
    };
  }

  const apiKey = sanitizeEnvValue(process.env.DEEPSEEK_API_KEY);

  if (!apiKey) {
    throwMissingEnv("DEEPSEEK_API_KEY", provider);
  }

  return {
    provider,
    model,
    apiKey,
    baseURL: sanitizeEnvValue(process.env.DEEPSEEK_BASE_URL) ?? "https://api.deepseek.com/v1",
  };
}

export function resolveGeminiConfig(): GeminiConfig {
  const provider: AIProvider = "google";
  const apiKey = sanitizeEnvValue(process.env.GOOGLE_API_KEY);

  if (!apiKey) {
    throwMissingEnv("GOOGLE_API_KEY", provider);
  }

  return {
    provider,
    model: resolveModel(provider),
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com",
  };
}
