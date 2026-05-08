import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type { Book, ReadingProgressResponse } from "@/types";

const BOOK_FIELDS =
  "id, user_id, title, author, language_from, language_to, file_path, cover_path, status, created_at, updated_at";

const DEFAULT_READING_PROGRESS: ReadingProgressResponse = {
  currentLocation: null,
  progressPercentage: 0,
};

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

export function buildBookStoragePath(userId: string, bookId: string) {
  return `${userId}/${bookId}/original.epub`;
}

export async function getUserBooks(): Promise<Book[]> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserBooks auth error:", authError.message);
    return [];
  }

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getUserBooks query error:", error.message);
    return [];
  }

  if (!data) {
    return [];
  }

  return data as Book[];
}

export async function getUserBookById(bookId: string): Promise<Book | null> {
  noStore();

  if (!bookId) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserBookById auth error:", authError.message);
    return null;
  }

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_FIELDS)
    .eq("id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getUserBookById query error:", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return data as Book;
}

export async function getUserReadingProgressByBookId(
  bookId: string,
): Promise<ReadingProgressResponse> {
  noStore();

  if (!bookId) {
    return DEFAULT_READING_PROGRESS;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserReadingProgressByBookId auth error:", authError.message);
    return DEFAULT_READING_PROGRESS;
  }

  if (!user) {
    return DEFAULT_READING_PROGRESS;
  }

  const { data, error } = await supabase
    .from("reading_progress")
    .select("current_location, progress_percentage")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) {
    console.error("getUserReadingProgressByBookId query error:", error.message);
    return DEFAULT_READING_PROGRESS;
  }

  return {
    currentLocation: typeof data?.current_location === "string" ? data.current_location : null,
    progressPercentage: normalizeProgressPercentage(data?.progress_percentage),
  };
}
