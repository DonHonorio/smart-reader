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

export type CreateBookUploadRequest = {
  title: string;
  author?: string | null;
  language_from: string;
  language_to: string;
  fileName: string;
  fileSize: number;
  fileType?: string | null;
};

export type CreateBookUploadSuccessResponse = {
  bookId: string;
  path: string;
  signedUrl: string;
  token: string;
};

export type CreateBookUploadResponse =
  | CreateBookUploadSuccessResponse
  | {
      error: string;
    };

export type CompleteBookUploadRequest = {
  bookId: string;
  filePath: string;
};

export type CompleteBookUploadResponse =
  | {
      success: true;
      bookId: string;
      filePath: string;
      creditsBalance: number;
    }
  | {
      error: string;
    };

export type CancelBookUploadRequest = {
  bookId: string;
  filePath?: string;
};

export type CancelBookUploadResponse =
  | {
      success: true;
      cancelled: boolean;
    }
  | {
      error: string;
    };

/**
 * Every reason the reader can fail to open a book. Kept explicit so an expired
 * signed URL is never reported to the user as a corrupt EPUB.
 */
export type BookAccessErrorCode =
  | "UNAUTHENTICATED"
  | "BOOK_NOT_FOUND"
  | "BOOK_NOT_OWNED"
  | "BOOK_NOT_READY"
  | "FILE_PATH_MISSING"
  | "SIGNED_URL_FAILED"
  | "SIGNED_URL_EXPIRED_OR_FORBIDDEN"
  | "STORAGE_FILE_NOT_FOUND"
  | "NETWORK_ERROR"
  | "EPUB_INVALID"
  | "EPUB_LOAD_TIMEOUT"
  | "UNKNOWN_ERROR";

export type BookAccessGrant = {
  bookId: string;
  /** Temporary Supabase Storage URL. Never persisted anywhere. */
  signedUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
};

export type BookAccessErrorResponse = {
  code: BookAccessErrorCode;
  error: string;
};

export type BookAccessResponse = BookAccessGrant | BookAccessErrorResponse;

export type BookAccessResult =
  | { ok: true; grant: BookAccessGrant }
  | { ok: false; code: BookAccessErrorCode };

export type ReaderTheme = "light" | "dark" | "sepia";

/** Load lifecycle of the reader. `error` is the only state that shows a final message. */
export type ReaderLoadPhase =
  | "idle"
  | "requesting_access"
  | "loading_epub"
  | "retrying_access"
  | "ready"
  | "error";

export type ReadingProgressSaveReason = "next" | "prev" | "stable_reading" | "manual";

export type ReaderPreferences = {
  theme: ReaderTheme;
  fontSize: number;
};

export type EpubReaderProps = {
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
  // Optional because legacy rows and narrowed selects may not include it.
  book_translation_id?: string | null;
};

/**
 * A translation the reader produced inside a book, anchored to an EPUB CFI range.
 * Persisted regardless of whether the user saved it to vocabulary.
 */
export type BookTranslation = {
  id: string;
  userId: string;
  bookId: string;
  cfiRange: string;
  chapterHref: string | null;
  selectedText: string;
  contextSentence: string | null;
  detectedExpression: string | null;
  baseForm: string | null;
  translation: string;
  unitType: string | null;
  confidence: number | null;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string | null;
  requestedModel: string | null;
  actualModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookTranslationRow = {
  id: string;
  user_id: string;
  book_id: string;
  cfi_range: string;
  chapter_href: string | null;
  selected_text: string;
  context_sentence: string | null;
  detected_expression: string | null;
  base_form: string | null;
  translation: string;
  unit_type: string | null;
  confidence: number | null;
  source_language: string;
  target_language: string;
  provider: string | null;
  requested_model: string | null;
  actual_model: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateBookTranslationRequest = {
  bookId: string;
  cfiRange: string;
  chapterHref?: string | null;
  selectedText: string;
  contextSentence?: string | null;
  detectedExpression?: string | null;
  baseForm?: string | null;
  translation: string;
  unitType?: string | null;
  /** Accepts the textual confidence used by the AI layer ("high" | "medium" | "low"). */
  confidence?: string | null;
  sourceLanguage: string;
  targetLanguage: string;
};

export type CreateBookTranslationStatus = "created" | "already_exists";

export type CreateBookTranslationResponse = {
  translation: BookTranslation;
  status: CreateBookTranslationStatus;
};

export type BookTranslationsResponse = {
  translations: BookTranslation[];
  savedVocabularyTranslationIds: string[];
};

/** Panel lifecycle for a selected or highlighted range. */
export type SelectionPanelState =
  | "new_translation"
  | "stored_translation"
  | "saved_vocabulary";

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
  bookTranslationId?: string | null;
};

export type SaveVocabularyStatus = "created" | "already_exists";

export type SaveVocabularyResponse = {
  item: VocabularyItem;
  status: SaveVocabularyStatus;
  message: string;
};

/**
 * Machine readable reason for a failed save. It lets the panel tell a expired session
 * apart from a plain write failure without parsing user facing copy.
 * A translation that does not exist and one that belongs to somebody else share
 * `TRANSLATION_NOT_FOUND` on purpose: the client must not learn the difference.
 */
export type SaveVocabularyErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "BOOK_NOT_FOUND"
  | "TRANSLATION_NOT_FOUND"
  | "SAVE_FAILED";

export type SaveVocabularyErrorResponse = {
  error: string;
  code: SaveVocabularyErrorCode;
};

/** Result of the optimistic save, as the panel consumes it. */
export type SaveVocabularyResult =
  | { ok: true; item: VocabularyItem; alreadyExisted: boolean }
  | { ok: false; code: SaveVocabularyErrorCode; message: string };

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
