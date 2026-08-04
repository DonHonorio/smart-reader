import type {
  SaveVocabularyErrorCode,
  SaveVocabularyRequest,
  SaveVocabularyResponse,
  SaveVocabularyResult,
  VocabularyItem,
} from "@/types";

export const VOCABULARY_SAVE_GENERIC_ERROR =
  "Could not save this vocabulary item. Please try again.";
export const VOCABULARY_SAVE_SESSION_ERROR =
  "Your session has expired. Please sign in again.";
export const VOCABULARY_SAVE_MISSING_CONTEXT_ERROR = "Context is required before saving.";

type VocabularySaveLogEvent =
  | "OPTIMISTIC_UPDATE"
  | "REQUEST_STARTED"
  | "SAVED"
  | "ALREADY_EXISTS"
  | "ROLLBACK"
  | "DUPLICATE_CLICK_IGNORED"
  | "STALE_RESPONSE_IGNORED"
  | "FAILED";

/**
 * Development-only breadcrumb. Never logs book content, signed URLs, tokens or keys:
 * only the translation id, the attempt number and the outcome.
 */
export function logVocabularySaveEvent(
  event: VocabularySaveLogEvent,
  details?: Record<string, string | number | boolean | null>,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.debug(`[vocabulary-save] ${event}`, details);
    return;
  }

  console.debug(`[vocabulary-save] ${event}`);
}

/** User facing copy for a failed save. A save failure is never a translation failure. */
export function getVocabularySaveErrorMessage(code: SaveVocabularyErrorCode) {
  if (code === "UNAUTHENTICATED") {
    return VOCABULARY_SAVE_SESSION_ERROR;
  }

  return VOCABULARY_SAVE_GENERIC_ERROR;
}

function normalizeErrorCode(value: unknown, status: number): SaveVocabularyErrorCode {
  const knownCodes: SaveVocabularyErrorCode[] = [
    "UNAUTHENTICATED",
    "INVALID_REQUEST",
    "BOOK_NOT_FOUND",
    "TRANSLATION_NOT_FOUND",
    "SAVE_FAILED",
  ];

  if (typeof value === "string" && knownCodes.includes(value as SaveVocabularyErrorCode)) {
    return value as SaveVocabularyErrorCode;
  }

  // Older responses only carried the status code.
  return status === 401 ? "UNAUTHENTICATED" : "SAVE_FAILED";
}

function isVocabularyItemLike(value: unknown): value is VocabularyItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<VocabularyItem>;

  return typeof candidate.term === "string" && typeof candidate.translation === "string";
}

/**
 * Browser helper: creates the vocabulary item for an already persisted translation.
 * The server is idempotent, so an item that already exists resolves as a success with
 * `alreadyExisted`. Network and parsing failures never throw: they resolve as `ok: false`
 * so the caller can roll its optimistic state back.
 *
 * The request is deliberately not aborted when the panel closes (see Fase 37 notes):
 * it keeps running while the page lives, but a tab closed right after the click can
 * still drop it. There is no persistent queue.
 */
export async function requestVocabularySave(
  body: SaveVocabularyRequest,
): Promise<SaveVocabularyResult> {
  let response: Response;

  try {
    response = await fetch("/api/vocabulary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: "SAVE_FAILED", message: VOCABULARY_SAVE_GENERIC_ERROR };
  }

  let data: (Partial<SaveVocabularyResponse> & { error?: string; code?: string }) | null = null;

  try {
    data = (await response.json()) as Partial<SaveVocabularyResponse> & {
      error?: string;
      code?: string;
    };
  } catch {
    data = null;
  }

  if (!response.ok) {
    const code = normalizeErrorCode(data?.code, response.status);

    return { ok: false, code, message: getVocabularySaveErrorMessage(code) };
  }

  if (!isVocabularyItemLike(data?.item) || (data?.status !== "created" && data?.status !== "already_exists")) {
    return { ok: false, code: "SAVE_FAILED", message: VOCABULARY_SAVE_GENERIC_ERROR };
  }

  return {
    ok: true,
    item: data.item,
    alreadyExisted: data.status === "already_exists",
  };
}
