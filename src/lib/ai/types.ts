import type { TranslateRequestBody, TranslationUnitType } from "@/types";

export type AIProvider = "openai" | "google" | "together" | "deepinfra" | "deepseek";

export type TranslationPrompt = {
  system: string;
  user: string;
};

export type AIAdapterResponse = {
  provider: AIProvider;
  actualModel: string;
  content: string;
};

export type TranslateWithAIInput = TranslateRequestBody;

export type InternalTranslationResponse = {
  selectedText: string;
  translationUnit: string;
  translation: string;
  isExpanded: boolean;
  unitType: TranslationUnitType;
};
