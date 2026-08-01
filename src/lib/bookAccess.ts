import type {
  BookAccessErrorCode,
  BookAccessErrorResponse,
  BookAccessGrant,
  BookAccessResponse,
  BookAccessResult,
} from "@/types";

/**
 * Signed URLs are temporary by design: they are requested per reader load from
 * `books.file_path` and never stored in the database, storage APIs, cookies or
 * navigation parameters.
 */
export const BOOK_ACCESS_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const BOOK_ACCESS_ENDPOINT = "/api/books/access";

/** Statuses that mean the upload is still pending or was discarded. */
const NOT_READY_BOOK_STATUSES: ReadonlySet<string> = new Set(["uploading", "failed"]);

const BOOK_ACCESS_ERROR_MESSAGES: Record<BookAccessErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Please sign in again.",
  BOOK_NOT_FOUND: "This book is not available.",
  BOOK_NOT_OWNED: "This book is not available.",
  BOOK_NOT_READY: "This book is not available.",
  FILE_PATH_MISSING: "The EPUB file could not be found. Please upload the book again.",
  SIGNED_URL_FAILED: "The book could not be loaded right now. Please try again.",
  SIGNED_URL_EXPIRED_OR_FORBIDDEN: "The book could not be loaded right now. Please try again.",
  STORAGE_FILE_NOT_FOUND: "The EPUB file could not be found. Please upload the book again.",
  NETWORK_ERROR: "The book could not be loaded right now. Please try again.",
  EPUB_INVALID: "The EPUB file could not be opened. Please upload a valid .epub file.",
  EPUB_LOAD_TIMEOUT: "The book is taking too long to load. Please try again.",
  UNKNOWN_ERROR: "The book could not be loaded right now. Please try again.",
};

const BOOK_ACCESS_HTTP_STATUS: Record<BookAccessErrorCode, number> = {
  UNAUTHENTICATED: 401,
  BOOK_NOT_FOUND: 404,
  BOOK_NOT_OWNED: 403,
  BOOK_NOT_READY: 409,
  FILE_PATH_MISSING: 409,
  SIGNED_URL_FAILED: 502,
  SIGNED_URL_EXPIRED_OR_FORBIDDEN: 502,
  STORAGE_FILE_NOT_FOUND: 404,
  NETWORK_ERROR: 503,
  EPUB_INVALID: 422,
  EPUB_LOAD_TIMEOUT: 504,
  UNKNOWN_ERROR: 500,
};

/**
 * Causes that a brand new signed URL can plausibly fix. A confirmed missing
 * object or an unreadable book is never retried.
 */
const RETRYABLE_BOOK_ACCESS_ERROR_CODES: ReadonlySet<BookAccessErrorCode> = new Set([
  "SIGNED_URL_FAILED",
  "SIGNED_URL_EXPIRED_OR_FORBIDDEN",
  "NETWORK_ERROR",
  "UNKNOWN_ERROR",
]);

const STORAGE_NOT_FOUND_HINTS = ["not_found", "object not found", "not found"];

const MAX_STORAGE_ERROR_BODY_CHARS = 300;

type BookAccessLogEvent =
  | "REQUESTING_SIGNED_URL"
  | "SIGNED_URL_CREATED"
  | "EPUB_LOAD_STARTED"
  | "ACCESS_RETRY_STARTED"
  | "ACCESS_RETRY_SUCCEEDED"
  | "ACCESS_RETRY_FAILED"
  | "STORAGE_FILE_NOT_FOUND"
  | "EPUB_INVALID";

/**
 * Development-only breadcrumb. Never logs signed URLs, tokens, cookies or book content.
 */
export function logBookAccessEvent(
  event: BookAccessLogEvent,
  details?: Record<string, string | number | boolean | null>,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.debug(`[book-access] ${event}`, details);
    return;
  }

  console.debug(`[book-access] ${event}`);
}

export function getBookAccessErrorMessage(code: BookAccessErrorCode) {
  return BOOK_ACCESS_ERROR_MESSAGES[code];
}

export function getBookAccessHttpStatus(code: BookAccessErrorCode) {
  return BOOK_ACCESS_HTTP_STATUS[code];
}

export function isRetryableBookAccessErrorCode(code: BookAccessErrorCode) {
  return RETRYABLE_BOOK_ACCESS_ERROR_CODES.has(code);
}

export function isReadableBookStatus(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return !NOT_READY_BOOK_STATUSES.has(normalized);
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isBookAccessErrorCode(value: unknown): value is BookAccessErrorCode {
  return typeof value === "string" && value in BOOK_ACCESS_ERROR_MESSAGES;
}

/** Fallback when the endpoint answered without a readable structured body. */
function mapHttpStatusToAccessErrorCode(status: number): BookAccessErrorCode {
  if (status === 401) {
    return "UNAUTHENTICATED";
  }

  if (status === 403) {
    return "BOOK_NOT_OWNED";
  }

  if (status === 404) {
    return "BOOK_NOT_FOUND";
  }

  if (status >= 500) {
    return "NETWORK_ERROR";
  }

  return "UNKNOWN_ERROR";
}

function isBookAccessGrant(value: unknown): value is BookAccessGrant {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BookAccessGrant>;

  return typeof candidate.signedUrl === "string" && candidate.signedUrl.trim().length > 0;
}

/** Maps a Supabase Storage failure to a code without leaking its internals. */
export function classifySupabaseStorageError(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();

  if (STORAGE_NOT_FOUND_HINTS.some((hint) => normalized.includes(hint))) {
    return "STORAGE_FILE_NOT_FOUND" as const;
  }

  return "SIGNED_URL_FAILED" as const;
}

async function readErrorBodyHint(response: Response) {
  try {
    const body = await response.text();
    return body.slice(0, MAX_STORAGE_ERROR_BODY_CHARS).toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Supabase Storage answers a deleted object with 404, and in some versions with
 * a 400 whose body carries `not_found`, so the body is inspected before assuming
 * the signature is the problem.
 */
async function classifyStorageDownloadResponse(
  response: Response,
): Promise<BookAccessErrorCode> {
  if (response.status === 404) {
    return "STORAGE_FILE_NOT_FOUND";
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    const bodyHint = await readErrorBodyHint(response);

    if (STORAGE_NOT_FOUND_HINTS.some((hint) => bodyHint.includes(hint))) {
      return "STORAGE_FILE_NOT_FOUND";
    }

    return "SIGNED_URL_EXPIRED_OR_FORBIDDEN";
  }

  if (response.status >= 500) {
    return "NETWORK_ERROR";
  }

  return "UNKNOWN_ERROR";
}

export function buildBookAccessErrorResponse(
  code: BookAccessErrorCode,
): BookAccessErrorResponse {
  return {
    code,
    error: getBookAccessErrorMessage(code),
  };
}

/**
 * Browser helper: asks the server for a brand new signed URL from `books.file_path`.
 * The client only sends the bookId; it never chooses a storage path.
 */
export async function requestBookAccess(params: {
  bookId: string;
  signal?: AbortSignal;
}): Promise<BookAccessResult> {
  const search = new URLSearchParams({ bookId: params.bookId });

  let response: Response;

  try {
    response = await fetch(`${BOOK_ACCESS_ENDPOINT}?${search.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: params.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return { ok: false, code: "NETWORK_ERROR" };
  }

  let payload: unknown;

  try {
    payload = (await response.json()) as BookAccessResponse;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return {
      ok: false,
      code: response.ok ? "UNKNOWN_ERROR" : mapHttpStatusToAccessErrorCode(response.status),
    };
  }

  if (!response.ok) {
    const code = (payload as Partial<BookAccessErrorResponse>)?.code;

    return {
      ok: false,
      code: isBookAccessErrorCode(code) ? code : mapHttpStatusToAccessErrorCode(response.status),
    };
  }

  if (!isBookAccessGrant(payload)) {
    return { ok: false, code: "UNKNOWN_ERROR" };
  }

  return { ok: true, grant: payload };
}

/**
 * Browser helper: downloads the EPUB with one specific signed URL. A failure here
 * is classified by cause, never as an invalid EPUB, because nothing was parsed yet.
 */
export async function downloadEpubFromSignedUrl(params: {
  signedUrl: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; code: BookAccessErrorCode }> {
  let response: Response;

  try {
    response = await fetch(params.signedUrl, {
      method: "GET",
      cache: "no-store",
      signal: params.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return { ok: false, code: "NETWORK_ERROR" };
  }

  if (!response.ok) {
    return { ok: false, code: await classifyStorageDownloadResponse(response) };
  }

  let data: ArrayBuffer;

  try {
    data = await response.arrayBuffer();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return { ok: false, code: "NETWORK_ERROR" };
  }

  // An empty body means the transfer or the object is broken, not that the EPUB is corrupt.
  if (data.byteLength === 0) {
    return { ok: false, code: "NETWORK_ERROR" };
  }

  return { ok: true, data };
}
