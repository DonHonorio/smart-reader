import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type { Book } from "@/types";

const BOOK_FIELDS =
  "id, user_id, title, author, language_from, language_to, file_path, cover_path, status, created_at, updated_at";

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
