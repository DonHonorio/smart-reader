export interface NavigationItem {
  href: string;
  label: string;
}

export type HealthResponse = {
  status: "ok";
  app: "smart-reader";
};

export type Book = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  language_from: string;
  language_to: string;
  file_path: string | null;
  cover_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EpubReaderProps = {
  fileUrl: string;
  bookId: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export type TranslateRequestBody = {
  selectedText: string;
  contextSentence: string | null;
  sourceLanguage: string;
  targetLanguage: string;
};

export type TranslationUnitType =
  | "single_word"
  | "phrasal_verb"
  | "idiom"
  | "collocation"
  | "phrase";

export type TranslateResponse = {
  selectedText: string;
  translationUnit: string;
  translation: string;
  isExpanded: boolean;
  unitType: TranslationUnitType;
};
