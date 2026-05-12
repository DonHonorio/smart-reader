"use server";

import JSZip from "jszip";
import { revalidatePath } from "next/cache";
import { buildBookStoragePath } from "@/lib/books";
import { consumeBookCredit, hasEnoughCredits } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_EPUB_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const EPUB_MIMETYPE_PATH = "mimetype";
const EPUB_CONTAINER_PATH = "META-INF/container.xml";
const EPUB_MIMETYPE_VALUE = "application/epub+zip";
const BOOKS_BUCKET = "books"; // Bucket name in Supabase Storage
const INVALID_EPUB_ERROR = "Invalid EPUB file. Please upload a valid .epub file.";
const FILE_TOO_LARGE_ERROR = "The EPUB file is too large. Maximum size is 25 MB.";
const TITLE_TOO_LONG_ERROR = "Title is too long. Maximum length is 160 characters.";
const FILE_READ_ERROR =
  "Could not read this file. If it is stored in cloud storage, download it to your device first and try again.";
const STORAGE_UPLOAD_ERROR = "Could not upload this file. Please try again.";
const INSUFFICIENT_CREDITS_ERROR = "You need 1 credit to upload a new book.";

export type UploadBookActionState = {
  error: string | null;
};

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function isValidEpubArchive(buffer: ArrayBuffer): Promise<boolean> {
  const zip = await JSZip.loadAsync(buffer);
  const mimetypeEntry = zip.file(EPUB_MIMETYPE_PATH);
  const containerEntry = zip.file(EPUB_CONTAINER_PATH);

  if (!mimetypeEntry || !containerEntry) {
    return false;
  }

  const mimetypeContent = (await mimetypeEntry.async("string")).trim().toLowerCase();

  return (
    mimetypeContent === EPUB_MIMETYPE_VALUE ||
    mimetypeContent.includes(EPUB_MIMETYPE_VALUE)
  );
}

async function cleanupOrphanBook(
  supabase: SupabaseClient,
  userId: string,
  bookId: string,
  filePath?: string,
) {
  try {
    if (filePath) {
      await supabase.storage.from(BOOKS_BUCKET).remove([filePath]);
    }

    await supabase.from("books").delete().eq("id", bookId).eq("user_id", userId);
  } catch (cleanupError) {
    console.error("uploadBookAction cleanup error:", cleanupError);
  }
}

export async function uploadBookAction(
  _prevState: UploadBookActionState,
  formData: FormData,
): Promise<UploadBookActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be signed in to upload a book." };
  }

  const title = getTextField(formData, "title");
  const authorValue = getTextField(formData, "author");
  const languageFrom = getTextField(formData, "language_from") || "en";
  const languageTo = getTextField(formData, "language_to") || "es";
  const file = formData.get("file");

  if (!title) {
    return { error: "Title is required." };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return { error: TITLE_TOO_LONG_ERROR };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please select an EPUB file." };
  }

  const lowerCaseName = file.name.toLowerCase();

  if (!lowerCaseName.endsWith(".epub")) {
    return { error: INVALID_EPUB_ERROR };
  }

  if (file.size > MAX_EPUB_SIZE_BYTES) {
    return { error: FILE_TOO_LARGE_ERROR };
  }

  let fileBuffer: ArrayBuffer;

  try {
    fileBuffer = await file.arrayBuffer();
  } catch {
    return { error: FILE_READ_ERROR };
  }

  let isValidEpub = false;

  try {
    isValidEpub = await isValidEpubArchive(fileBuffer);
  } catch {
    return { error: INVALID_EPUB_ERROR };
  }

  if (!isValidEpub) {
    return { error: INVALID_EPUB_ERROR };
  }

  const canUploadBook = await hasEnoughCredits(1);

  if (!canUploadBook) {
    return { error: INSUFFICIENT_CREDITS_ERROR };
  }

  const { data: bookRecord, error: insertError } = await supabase
    .from("books")
    .insert({
      user_id: user.id,
      title,
      author: authorValue || null,
      language_from: languageFrom,
      language_to: languageTo,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insertError || !bookRecord) {
    return { error: "Could not create the book record." };
  }

  const bookId = bookRecord.id as string;
  const filePath = buildBookStoragePath(user.id, bookId);

  try {
    const { error: uploadError } = await supabase.storage
      .from(BOOKS_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: file.type || "application/epub+zip",
        upsert: false,
      });

    if (uploadError) {
      await cleanupOrphanBook(supabase, user.id, bookId);
      return { error: STORAGE_UPLOAD_ERROR };
    }
  } catch {
    await cleanupOrphanBook(supabase, user.id, bookId);
    return { error: STORAGE_UPLOAD_ERROR };
  }

  const { error: updateError } = await supabase
    .from("books")
    .update({ file_path: filePath })
    .eq("id", bookId)
    .eq("user_id", user.id);

  if (updateError) {
    await cleanupOrphanBook(supabase, user.id, bookId, filePath);
    return { error: "Upload succeeded, but saving the book failed." };
  }

  const creditConsumptionResult = await consumeBookCredit(bookId);

  if (!creditConsumptionResult.success) {
    await cleanupOrphanBook(supabase, user.id, bookId, filePath);
    return { error: creditConsumptionResult.error };
  }

  revalidatePath("/library");
  return { error: null };
}
