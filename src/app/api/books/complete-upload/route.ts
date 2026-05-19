import { NextResponse } from "next/server";
import { BOOKS_BUCKET, buildBookStoragePath, normalizeBookText } from "@/lib/books";
import { consumeBookCredit, getUserCredits } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";
import type { CompleteBookUploadRequest, CompleteBookUploadResponse } from "@/types";

export const runtime = "nodejs";

const GENERIC_UPLOAD_ERROR = "Could not upload this file. Please try again.";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message } satisfies CompleteBookUploadResponse, { status });
}

function isUploadedBookFilePresent(files: Array<{ name: string }> | null | undefined) {
  if (!files || files.length === 0) {
    return false;
  }

  return files.some((file) => file.name === "original.epub");
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

  const { bookId, filePath } = (body ?? {}) as Partial<CompleteBookUploadRequest>;
  const normalizedBookId = normalizeBookText(bookId);
  const normalizedFilePath = normalizeBookText(filePath);

  if (!normalizedBookId) {
    return jsonError("bookId is required.", 400);
  }

  if (!normalizedFilePath) {
    return jsonError("filePath is required.", 400);
  }

  const expectedPath = buildBookStoragePath(user.id, normalizedBookId);

  if (normalizedFilePath !== expectedPath) {
    return jsonError("Invalid filePath.", 400);
  }

  const { data: bookRow, error: bookQueryError } = await supabase
    .from("books")
    .select("id, status, file_path")
    .eq("id", normalizedBookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bookQueryError) {
    console.error("/api/books/complete-upload book query error:", bookQueryError.message);
    return jsonError(GENERIC_UPLOAD_ERROR, 500);
  }

  if (!bookRow) {
    return jsonError("Book not found.", 404);
  }

  if (bookRow.status === "uploaded" && bookRow.file_path === normalizedFilePath) {
    const currentCredits = await getUserCredits();

    return NextResponse.json({
      success: true,
      bookId: normalizedBookId,
      filePath: normalizedFilePath,
      creditsBalance: Math.max(0, currentCredits ?? 0),
    } satisfies CompleteBookUploadResponse);
  }

  if (bookRow.status !== "uploading") {
    return jsonError("This upload is no longer pending.", 409);
  }

  const objectFolder = `${user.id}/${normalizedBookId}`;
  const { data: storageObjects, error: storageQueryError } = await supabase.storage
    .from(BOOKS_BUCKET)
    .list(objectFolder, {
      limit: 1,
      search: "original.epub",
    });

  if (storageQueryError) {
    console.warn("/api/books/complete-upload storage query warning:", storageQueryError.message);
  } else if (!isUploadedBookFilePresent(storageObjects as Array<{ name: string }>)) {
    return jsonError(GENERIC_UPLOAD_ERROR, 400);
  }

  const { data: updatedBook, error: updateBookError } = await supabase
    .from("books")
    .update({
      file_path: normalizedFilePath,
      status: "uploaded",
    })
    .eq("id", normalizedBookId)
    .eq("user_id", user.id)
    .eq("status", "uploading")
    .select("id")
    .maybeSingle();

  if (updateBookError || !updatedBook) {
    if (updateBookError) {
      console.error("/api/books/complete-upload update error:", updateBookError.message);
    }

    const { data: latestBookRow } = await supabase
      .from("books")
      .select("status, file_path")
      .eq("id", normalizedBookId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (latestBookRow?.status === "uploaded" && latestBookRow.file_path === normalizedFilePath) {
      const currentCredits = await getUserCredits();

      return NextResponse.json({
        success: true,
        bookId: normalizedBookId,
        filePath: normalizedFilePath,
        creditsBalance: Math.max(0, currentCredits ?? 0),
      } satisfies CompleteBookUploadResponse);
    }

    return jsonError(GENERIC_UPLOAD_ERROR, 500);
  }

  const creditConsumptionResult = await consumeBookCredit(normalizedBookId);

  if (!creditConsumptionResult.success) {
    await Promise.all([
      supabase.storage.from(BOOKS_BUCKET).remove([normalizedFilePath]),
      supabase
        .from("books")
        .update({
          file_path: null,
          status: "failed",
        })
        .eq("id", normalizedBookId)
        .eq("user_id", user.id),
    ]);

    return jsonError(creditConsumptionResult.error, 400);
  }

  return NextResponse.json({
    success: true,
    bookId: normalizedBookId,
    filePath: normalizedFilePath,
    creditsBalance: creditConsumptionResult.balance,
  } satisfies CompleteBookUploadResponse);
}
