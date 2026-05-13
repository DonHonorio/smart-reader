import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type { Book, BookWithProgress, ReadingProgressResponse } from "@/types";

const BOOK_FIELDS =
  "id, user_id, title, author, language_from, language_to, file_path, cover_path, status, created_at, updated_at";

const DEFAULT_READING_PROGRESS: ReadingProgressResponse = {
  currentLocation: null,
  progressPercentage: 0,
};

type ReadingProgressBookRow = {
  book_id: string;
  progress_percentage: unknown;
  updated_at: string | null;
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

function normalizeDateString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
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

export async function getUserBooksWithProgress(): Promise<BookWithProgress[]> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserBooksWithProgress auth error:", authError.message);
    return [];
  }

  if (!user) {
    return [];
  }

  const [booksResult, progressResult] = await Promise.all([
    supabase.from("books").select(BOOK_FIELDS).eq("user_id", user.id),
    supabase
      .from("reading_progress")
      .select("book_id, progress_percentage, updated_at")
      .eq("user_id", user.id),
  ]);

  if (booksResult.error) {
    console.error("getUserBooksWithProgress books query error:", booksResult.error.message);
    return [];
  }

  if (progressResult.error) {
    console.error(
      "getUserBooksWithProgress reading_progress query error:",
      progressResult.error.message,
    );
  }

  const books = (booksResult.data ?? []) as Book[];

  if (books.length === 0) {
    return [];
  }

  const progressRows = (progressResult.data ?? []) as ReadingProgressBookRow[];
  const progressByBookId = new Map<
    string,
    {
      progress_percentage: number;
      last_read_at: string | null;
    }
  >();

  for (const progressRow of progressRows) {
    const nextProgressPercentage = normalizeProgressPercentage(progressRow.progress_percentage);
    const nextLastReadAt = normalizeDateString(progressRow.updated_at);
    const existingProgress = progressByBookId.get(progressRow.book_id);

    if (!existingProgress) {
      progressByBookId.set(progressRow.book_id, {
        progress_percentage: nextProgressPercentage,
        last_read_at: nextLastReadAt,
      });
      continue;
    }

    const existingTimestamp = toTimestamp(existingProgress.last_read_at);
    const nextTimestamp = toTimestamp(nextLastReadAt);

    if (nextTimestamp >= existingTimestamp) {
      progressByBookId.set(progressRow.book_id, {
        progress_percentage: nextProgressPercentage,
        last_read_at: nextLastReadAt,
      });
    }
  }

  const booksWithProgress: BookWithProgress[] = books.map((book) => {
    const progress = progressByBookId.get(book.id);

    return {
      ...book,
      progress_percentage: progress?.progress_percentage ?? null,
      last_read_at: progress?.last_read_at ?? null,
    };
  });

  booksWithProgress.sort((leftBook, rightBook) => {
    const leftProgress = normalizeProgressPercentage(leftBook.progress_percentage);
    const rightProgress = normalizeProgressPercentage(rightBook.progress_percentage);
    const leftIsCompleted = leftProgress >= 95;
    const rightIsCompleted = rightProgress >= 95;

    if (leftIsCompleted !== rightIsCompleted) {
      return leftIsCompleted ? 1 : -1;
    }

    const leftHasProgress = leftProgress > 0;
    const rightHasProgress = rightProgress > 0;

    if (leftHasProgress !== rightHasProgress) {
      return leftHasProgress ? -1 : 1;
    }

    if (leftHasProgress && rightHasProgress) {
      const lastReadAtDelta = toTimestamp(rightBook.last_read_at) - toTimestamp(leftBook.last_read_at);

      if (lastReadAtDelta !== 0) {
        return lastReadAtDelta;
      }
    }

    const createdAtDelta = toTimestamp(rightBook.created_at) - toTimestamp(leftBook.created_at);

    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return leftBook.title.localeCompare(rightBook.title);
  });

  return booksWithProgress;
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
