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

export type BookWithProgress = Book & {
  progress_percentage?: number | null;
  last_read_at?: string | null;
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

export type CreateCheckoutSessionRequest = {
  packId: string;
};

export type CreateCheckoutSessionResponse =
  | {
      url: string;
    }
  | {
      error: string;
    };

export type CheckoutStatus = "success" | "cancelled";

export type ReaderTheme = "light" | "dark" | "sepia";

export type ReadingProgressSaveReason = "next" | "prev" | "stable_reading" | "manual";

export type ReaderPreferences = {
  theme: ReaderTheme;
  fontSize: number;
};

export type EpubReaderProps = {
  fileUrl: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  sourceLanguage: string;
  targetLanguage: string;
  initialLocation?: string | null;
  initialProgressPercentage?: number | null;
};

export type ReadingProgress = {
  user_id: string;
  book_id: string;
  current_location: string | null;
  progress_percentage: number;
  chapter_href: string | null;
  save_reason: ReadingProgressSaveReason | null;
  last_stable_at: string | null;
  updated_at: string;
};

export type DashboardLatestBook = {
  id: string;
  title: string;
  author: string | null;
  status: string;
  created_at: string;
};

export type DashboardLatestReadingProgress = {
  book_id: string;
  current_location: string | null;
  progress_percentage: number;
  updated_at: string;
  book_title: string | null;
};

export type DashboardData = {
  creditsBalance: number;
  booksCount: number;
  vocabularyCount: number;
  latestBook: DashboardLatestBook | null;
  latestReadingProgress: DashboardLatestReadingProgress | null;
};

export type ReadingProgressResponse = {
  currentLocation: string | null;
  progressPercentage: number;
  chapterHref: string | null;
  saveReason: ReadingProgressSaveReason | null;
  lastStableAt: string | null;
};

export type UpsertReadingProgressRequest = {
  bookId: string;
  currentLocation: string;
  progressPercentage: number;
  chapterHref?: string | null;
  saveReason?: ReadingProgressSaveReason;
};

export type TranslateRequestBody = {
  selectedText: string;
  contextSentence: string | null;
  sourceLanguage: string;
  targetLanguage: string;
};

export type VocabularySortOrder = "newest" | "oldest";

export type VocabularyUnitType =
  | "single_word"
  | "phrasal_verb"
  | "idiom"
  | "collocation"
  | "fixed_expression"
  | "phrase";

export type TranslationUnitType = VocabularyUnitType;

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

export type GetUserVocabularyItemsParams = {
  search?: string;
  unitType?: string;
  bookId?: string;
  sort?: VocabularySortOrder;
  limit?: number;
};

export type VocabularyBookFilterOption = {
  id: string;
  title: string;
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

export type OnboardingStatus = "pending" | "completed" | "skipped";

export type UserOnboarding = {
  user_id: string;
  status: OnboardingStatus;
  current_step: number;
  completed_at: string | null;
  skipped_at: string | null;
  created_at: string;
  updated_at: string;
};
