import { NextResponse } from "next/server";
import {
  BOOKS_BUCKET,
  buildBookStoragePath,
  isSupportedEpubFileName,
  MAX_BOOK_TITLE_LENGTH,
  MAX_BOOK_UPLOAD_SIZE_BYTES,
  normalizeBookText,
} from "@/lib/books";
import { hasEnoughCredits } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";
import type { CreateBookUploadRequest, CreateBookUploadResponse } from "@/types";

export const runtime = "nodejs";

const FILE_TOO_LARGE_ERROR = "The EPUB file is too large. Maximum size is 25 MB.";
const FILE_TYPE_ERROR = "Only EPUB files are supported.";
const TITLE_TOO_LONG_ERROR = "Title is too long. Maximum length is 160 characters.";
const INSUFFICIENT_CREDITS_ERROR = "You need 1 credit to upload a book.";
const GENERIC_UPLOAD_ERROR = "Could not upload this file. Please try again.";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message } satisfies CreateBookUploadResponse, { status });
}

function toNormalizedFileSize(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0) {
    return null;
  }

  return Math.floor(value);
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

  const {
    title,
    author,
    language_from,
    language_to,
    fileName,
    fileSize,
  } = (body ?? {}) as Partial<CreateBookUploadRequest>;

  const normalizedTitle = normalizeBookText(title);

  if (!normalizedTitle) {
    return jsonError("Title is required.", 400);
  }

  if (normalizedTitle.length > MAX_BOOK_TITLE_LENGTH) {
    return jsonError(TITLE_TOO_LONG_ERROR, 400);
  }

  const normalizedFileName = normalizeBookText(fileName);

  if (!isSupportedEpubFileName(normalizedFileName)) {
    return jsonError(FILE_TYPE_ERROR, 400);
  }

  const normalizedFileSize = toNormalizedFileSize(fileSize);

  if (!normalizedFileSize) {
    return jsonError(FILE_TYPE_ERROR, 400);
  }

  if (normalizedFileSize > MAX_BOOK_UPLOAD_SIZE_BYTES) {
    return jsonError(FILE_TOO_LARGE_ERROR, 400);
  }

  const canUpload = await hasEnoughCredits(1);

  if (!canUpload) {
    return jsonError(INSUFFICIENT_CREDITS_ERROR, 400);
  }

  const normalizedAuthor = normalizeBookText(author);
  const normalizedLanguageFrom = normalizeBookText(language_from) || "en";
  const normalizedLanguageTo = normalizeBookText(language_to) || "es";

  const { data: bookRow, error: bookInsertError } = await supabase
    .from("books")
    .insert({
      user_id: user.id,
      title: normalizedTitle,
      author: normalizedAuthor || null,
      language_from: normalizedLanguageFrom,
      language_to: normalizedLanguageTo,
      file_path: null,
      status: "uploading",
    })
    .select("id")
    .single();

  if (bookInsertError || !bookRow?.id) {
    console.error("/api/books/create-upload book insert error:", bookInsertError?.message);
    return jsonError(GENERIC_UPLOAD_ERROR, 500);
  }

  const bookId = bookRow.id as string;
  const path = buildBookStoragePath(user.id, bookId);

  const { data: signedUploadData, error: signedUploadError } = await supabase.storage
    .from(BOOKS_BUCKET)
    .createSignedUploadUrl(path);

  if (signedUploadError || !signedUploadData?.token || !signedUploadData.signedUrl) {
    console.error("/api/books/create-upload signed URL error:", signedUploadError?.message);

    await supabase.from("books").delete().eq("id", bookId).eq("user_id", user.id);

    return jsonError(GENERIC_UPLOAD_ERROR, 500);
  }

  return NextResponse.json({
    bookId,
    path,
    signedUrl: signedUploadData.signedUrl,
    token: signedUploadData.token,
  } satisfies CreateBookUploadResponse);
}
