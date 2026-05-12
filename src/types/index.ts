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

export type CreditTransactionType =
  | "signup_bonus"
  | "purchase"
  | "book_unlock"
  | "refund"
  | "adjustment";

export type UserCredits = {
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
};

export type CreditTransaction = {
  id: string;
  user_id: string;
  type: CreditTransactionType;
  amount: number;
  reason: string | null;
  book_id: string | null;
  stripe_session_id: string | null;
  created_at: string;
};

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  displayPrice: string;
  description: string;
  pricePerBook: string;
  highlighted?: boolean;
  badge?: string;
};

export type EpubReaderProps = {
  fileUrl: string;
  bookId: string;
  sourceLanguage: string;
  targetLanguage: string;
  initialLocation?: string | null;
};

export type ReadingProgress = {
  user_id: string;
  book_id: string;
  current_location: string | null;
  progress_percentage: number;
  updated_at: string;
};

export type ReadingProgressResponse = {
  currentLocation: string | null;
  progressPercentage: number;
};

export type UpsertReadingProgressRequest = {
  bookId: string;
  currentLocation: string;
  progressPercentage: number;
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

export type SaveVocabularyStatus = "created" | "already_exists";

export type SaveVocabularyResponse = {
  item: VocabularyItem;
  status: SaveVocabularyStatus;
  message: string;
};
