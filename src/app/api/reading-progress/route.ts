import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReadingProgressResponse, UpsertReadingProgressRequest } from "@/types";

const MAX_CFI_LENGTH = 2000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeProgressPercentage(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
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

function parseOptionalProgressPercentage(value: unknown) {
  if (typeof value === "undefined") {
    return {
      isProvided: false,
      value: undefined,
    } as const;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    return {
      isProvided: true,
      value: null,
    } as const;
  }

  if (!isProgressPercentageInRange(value)) {
    return {
      isProvided: true,
      value: null,
    } as const;
  }

  return {
    isProvided: true,
    value: normalizeProgressPercentage(value),
  } as const;
}

function isProgressPercentageInRange(value: number) {
  return value >= 0 && value <= 100;
}

function buildResponse(
  currentLocation: string | null,
  progressPercentage: unknown,
): ReadingProgressResponse {
  return {
    currentLocation,
    progressPercentage: normalizeProgressPercentage(progressPercentage),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookId = normalizeText(url.searchParams.get("bookId") ?? "");

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
      .select("current_location, progress_percentage")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) {
      return jsonError("Could not load reading progress.", 500);
    }

    return NextResponse.json(
      buildResponse(
        typeof data?.current_location === "string" ? data.current_location : null,
        data?.progress_percentage,
      ),
    );
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

  const { bookId, currentLocation, progressPercentage } =
    (body ?? {}) as Partial<UpsertReadingProgressRequest>;

  if (typeof bookId !== "string" || !normalizeText(bookId)) {
    return jsonError("bookId is required.", 400);
  }

  const normalizedBookId = normalizeText(bookId);

  if (typeof currentLocation !== "string") {
    return jsonError("currentLocation is required.", 400);
  }

  const normalizedCurrentLocation = normalizeText(currentLocation);

  if (!normalizedCurrentLocation) {
    return jsonError("currentLocation is required.", 400);
  }

  if (normalizedCurrentLocation.length > MAX_CFI_LENGTH) {
    return jsonError("currentLocation is too long.", 400);
  }

  const parsedProgressPercentage = parseOptionalProgressPercentage(progressPercentage);

  if (parsedProgressPercentage.isProvided && parsedProgressPercentage.value === null) {
    return jsonError("progressPercentage must be a valid number between 0 and 100.", 400);
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

    const upsertPayload = {
      user_id: user.id,
      book_id: normalizedBookId,
      current_location: normalizedCurrentLocation,
      updated_at: new Date().toISOString(),
      ...(typeof parsedProgressPercentage.value === "number"
        ? { progress_percentage: parsedProgressPercentage.value }
        : {}),
    };

    const { data: savedProgress, error: upsertError } = await supabase
      .from("reading_progress")
      .upsert(upsertPayload, {
        onConflict: "user_id,book_id",
      })
      .select("current_location, progress_percentage")
      .maybeSingle();

    if (upsertError) {
      return jsonError("Could not save reading progress.", 500);
    }

    return NextResponse.json(
      buildResponse(
        typeof savedProgress?.current_location === "string"
          ? savedProgress.current_location
          : normalizedCurrentLocation,
        savedProgress?.progress_percentage,
      ),
    );
  } catch (error) {
    console.error("/api/reading-progress POST unexpected error:", error);
    return jsonError("Could not save reading progress.", 500);
  }
}