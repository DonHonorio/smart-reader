import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  ReadingProgressResponse,
  ReadingProgressSaveReason,
  UpsertReadingProgressRequest,
} from "@/types";

const MAX_CFI_LENGTH = 2000;
const MAX_CHAPTER_HREF_LENGTH = 500;

const ALLOWED_SAVE_REASONS: ReadonlyArray<ReadingProgressSaveReason> = [
  "next",
  "prev",
  "stable_reading",
  "manual",
];

type ReadingProgressRow = {
  current_location: unknown;
  progress_percentage: unknown;
  chapter_href: unknown;
  save_reason: unknown;
  last_stable_at: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeIdentifier(value: string) {
  return value.trim();
}

function normalizeStoredProgressPercentage(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}

function normalizeProgressPercentage(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseProgressPercentage(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return {
      isValid: false,
      value: null,
    } as const;
  }

  if (!isProgressPercentageInRange(value)) {
    return {
      isValid: false,
      value: null,
    } as const;
  }

  return {
    isValid: true,
    value: normalizeProgressPercentage(value),
  } as const;
}

function isProgressPercentageInRange(value: number) {
  return value >= 0 && value <= 100;
}

function parseOptionalChapterHref(value: unknown) {
  if (typeof value === "undefined" || value === null) {
    return {
      isValid: true,
      value: null,
    } as const;
  }

  if (typeof value !== "string") {
    return {
      isValid: false,
      value: null,
      error: "chapterHref must be a string or null.",
    } as const;
  }

  const normalized = value.trim();

  if (!normalized) {
    return {
      isValid: true,
      value: null,
    } as const;
  }

  if (normalized.length > MAX_CHAPTER_HREF_LENGTH) {
    return {
      isValid: false,
      value: null,
      error: `chapterHref must be at most ${MAX_CHAPTER_HREF_LENGTH} characters.`,
    } as const;
  }

  return {
    isValid: true,
    value: normalized,
  } as const;
}

function parseOptionalSaveReason(value: unknown) {
  if (typeof value === "undefined" || value === null) {
    return {
      isValid: true,
      value: null,
    } as const;
  }

  if (typeof value !== "string" || !(ALLOWED_SAVE_REASONS as ReadonlyArray<string>).includes(value)) {
    return {
      isValid: false,
      value: null,
      error: "saveReason must be one of: next, prev, stable_reading, manual.",
    } as const;
  }

  return {
    isValid: true,
    value,
  } as const;
}

function buildResponse(data: ReadingProgressRow | null, fallbackCurrentLocation: string | null = null): ReadingProgressResponse {
  return {
    currentLocation:
      normalizeOptionalString(data?.current_location)
      ?? fallbackCurrentLocation,
    progressPercentage: normalizeStoredProgressPercentage(data?.progress_percentage),
    chapterHref: normalizeOptionalString(data?.chapter_href),
    saveReason:
      typeof data?.save_reason === "string" &&
      (ALLOWED_SAVE_REASONS as ReadonlyArray<string>).includes(data.save_reason)
        ? (data.save_reason as ReadingProgressSaveReason)
        : null,
    lastStableAt: normalizeOptionalString(data?.last_stable_at),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookId = normalizeIdentifier(url.searchParams.get("bookId") ?? "");

  if (!bookId) {
    return jsonError("bookId is required.", 400);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("Authentication required.", 401);
    }

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id")
      .eq("id", bookId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bookError) {
      return jsonError("Could not verify book access.", 500);
    }

    if (!book) {
      return jsonError("Book not found.", 404);
    }

    const { data, error } = await supabase
      .from("reading_progress")
      .select(
        "current_location, progress_percentage, chapter_href, save_reason, last_stable_at",
      )
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) {
      return jsonError("Could not load reading progress.", 500);
    }

    return NextResponse.json(buildResponse((data as ReadingProgressRow | null) ?? null));
  } catch (error) {
    console.error("/api/reading-progress GET unexpected error:", error);
    return jsonError("Could not load reading progress.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const { bookId, currentLocation, progressPercentage, chapterHref, saveReason } =
    (body ?? {}) as Partial<UpsertReadingProgressRequest>;

  if (typeof bookId !== "string" || !normalizeIdentifier(bookId)) {
    return jsonError("bookId is required.", 400);
  }

  const normalizedBookId = normalizeIdentifier(bookId);

  if (typeof currentLocation !== "string") {
    return jsonError("currentLocation is required.", 400);
  }

  const normalizedCurrentLocation = currentLocation.trim();

  if (!normalizedCurrentLocation) {
    return jsonError("currentLocation is required.", 400);
  }

  if (normalizedCurrentLocation.length > MAX_CFI_LENGTH) {
    return jsonError("currentLocation is too long.", 400);
  }

  const parsedProgressPercentage = parseProgressPercentage(progressPercentage);

  if (!parsedProgressPercentage.isValid || parsedProgressPercentage.value === null) {
    return jsonError("progressPercentage must be a valid number between 0 and 100.", 400);
  }

  const parsedChapterHref = parseOptionalChapterHref(chapterHref);
  if (!parsedChapterHref.isValid) {
    return jsonError(parsedChapterHref.error, 400);
  }

  const parsedSaveReason = parseOptionalSaveReason(saveReason);
  if (!parsedSaveReason.isValid) {
    return jsonError(parsedSaveReason.error, 400);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("Authentication required.", 401);
    }

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id")
      .eq("id", normalizedBookId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bookError) {
      return jsonError("Could not verify book access.", 500);
    }

    if (!book) {
      return jsonError("Book not found.", 404);
    }

    const nowIso = new Date().toISOString();
    const upsertPayload = {
      user_id: user.id,
      book_id: normalizedBookId,
      current_location: normalizedCurrentLocation,
      progress_percentage: parsedProgressPercentage.value,
      chapter_href: parsedChapterHref.value,
      save_reason: parsedSaveReason.value ?? "manual",
      last_stable_at: nowIso,
      updated_at: nowIso,
    };

    const { data: savedProgress, error: upsertError } = await supabase
      .from("reading_progress")
      .upsert(upsertPayload, {
        onConflict: "user_id,book_id",
      })
      .select(
        "current_location, progress_percentage, chapter_href, save_reason, last_stable_at",
      )
      .maybeSingle();

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError);
      return jsonError("Could not save reading progress.", 500);
    }

    return NextResponse.json(
      buildResponse(
        (savedProgress as ReadingProgressRow | null) ?? null,
        normalizedCurrentLocation,
      ),
    );
  } catch (error) {
    console.error("/api/reading-progress POST unexpected error:", error);
    return jsonError("Could not save reading progress.", 500);
  }
}