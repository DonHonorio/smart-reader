import { NextResponse } from "next/server";
import { BOOKS_BUCKET, buildBookStoragePath, normalizeBookText } from "@/lib/books";
import { createClient } from "@/lib/supabase/server";
import type { CancelBookUploadRequest, CancelBookUploadResponse } from "@/types";

export const runtime = "nodejs";

const GENERIC_UPLOAD_ERROR = "Could not upload this file. Please try again.";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message } satisfies CancelBookUploadResponse, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Authentication required.", 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const { bookId, filePath } = (body ?? {}) as Partial<CancelBookUploadRequest>;
  const normalizedBookId = normalizeBookText(bookId);

  if (!normalizedBookId) {
    return jsonError("bookId is required.", 400);
  }

  const { data: bookRow, error: bookQueryError } = await supabase
    .from("books")
    .select("id, status")
    .eq("id", normalizedBookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bookQueryError) {
    console.error("/api/books/cancel-upload book query error:", bookQueryError.message);
    return jsonError(GENERIC_UPLOAD_ERROR, 500);
  }

  if (!bookRow || bookRow.status !== "uploading") {
    return NextResponse.json({
      success: true,
      cancelled: false,
    } satisfies CancelBookUploadResponse);
  }

  const expectedPath = buildBookStoragePath(user.id, normalizedBookId);
  const normalizedFilePath = normalizeBookText(filePath);
  const pathToRemove = normalizedFilePath === expectedPath ? normalizedFilePath : expectedPath;

  const [removeStorageResult, deleteBookResult] = await Promise.all([
    supabase.storage.from(BOOKS_BUCKET).remove([pathToRemove]),
    supabase.from("books").delete().eq("id", normalizedBookId).eq("user_id", user.id).eq("status", "uploading"),
  ]);

  if (removeStorageResult.error) {
    console.warn(
      "/api/books/cancel-upload storage cleanup warning:",
      removeStorageResult.error.message,
    );
  }

  if (deleteBookResult.error) {
    console.error("/api/books/cancel-upload delete book error:", deleteBookResult.error.message);
    return jsonError(GENERIC_UPLOAD_ERROR, 500);
  }

  return NextResponse.json({
    success: true,
    cancelled: true,
  } satisfies CancelBookUploadResponse);
}
