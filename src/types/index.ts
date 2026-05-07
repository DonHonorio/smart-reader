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

export type LegacyTranslateResponse = {
  selectedText: string;
  translationUnit: string;
  translation: string;
  isExpanded: boolean;
  unitType: TranslationUnitType;
};

export type SemanticTranslateResponse = {
  selectedText: string;
  surfaceUnit: string;
  canonicalUnit: string;
  translation: string;
  isExpanded: boolean;
  unitType: TranslationUnitType;
  confidence: string;
};

export type TranslateResponse = LegacyTranslateResponse | SemanticTranslateResponse;

export type VocabularyItem = {
  id: string;
  user_id: string;
  book_id: string;
  selected_text: string;
  term: string;
  canonical_unit: string | null;
  translation: string;
  context_sentence: string;
  unit_type: string | null;
  confidence: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SaveVocabularyRequest = {
  bookId: string;
  selectedText: string;
  term: string;
  canonicalUnit: string;
  translation: string;
  contextSentence: string;
  unitType: string;
  confidence: string;
};

export type SaveVocabularyResponse = {
  item: VocabularyItem;
};
