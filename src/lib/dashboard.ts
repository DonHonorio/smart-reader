import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardData,
  DashboardLatestBook,
  DashboardLatestReadingProgress,
} from "@/types";

type CreditsRow = {
  balance: unknown;
};

type LatestBookRow = {
  id: string;
  title: string;
  author: string | null;
  status: string;
  created_at: string;
};

type LatestReadingProgressRow = {
  book_id: string;
  current_location: string | null;
  progress_percentage: unknown;
  updated_at: string;
};

function normalizeCount(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return 0;
  }

  return value;
}

function normalizeCreditsBalance(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return 0;
  }

  return value;
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

function mapLatestBook(row: LatestBookRow | null): DashboardLatestBook | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    author: typeof row.author === "string" ? row.author : null,
    status: row.status,
    created_at: row.created_at,
  };
}

function mapLatestReadingProgress(
  row: LatestReadingProgressRow | null,
): DashboardLatestReadingProgress | null {
  if (!row) {
    return null;
  }

  return {
    book_id: row.book_id,
    current_location: typeof row.current_location === "string" ? row.current_location : null,
    progress_percentage: normalizeProgressPercentage(row.progress_percentage),
    updated_at: row.updated_at,
    book_title: null,
  };
}

export async function getDashboardData(): Promise<DashboardData | null> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getDashboardData auth error:", authError.message);
    return null;
  }

  if (!user) {
    return null;
  }

  const [creditsResult, booksCountResult, vocabularyCountResult, latestBookResult, latestProgressResult] =
    await Promise.all([
      supabase.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("books").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("vocabulary_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("books")
        .select("id, title, author, status, created_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("reading_progress")
        .select("book_id, current_location, progress_percentage, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (creditsResult.error) {
    console.error("getDashboardData credits query error:", creditsResult.error.message);
  }

  if (booksCountResult.error) {
    console.error("getDashboardData books count query error:", booksCountResult.error.message);
  }

  if (vocabularyCountResult.error) {
    console.error(
      "getDashboardData vocabulary count query error:",
      vocabularyCountResult.error.message,
    );
  }

  if (latestBookResult.error) {
    console.error("getDashboardData latest book query error:", latestBookResult.error.message);
  }

  if (latestProgressResult.error) {
    console.error(
      "getDashboardData latest progress query error:",
      latestProgressResult.error.message,
    );
  }

  const creditsBalance = normalizeCreditsBalance((creditsResult.data as CreditsRow | null)?.balance);
  const booksCount = normalizeCount(booksCountResult.count);
  const vocabularyCount = normalizeCount(vocabularyCountResult.count);
  const latestBook = mapLatestBook((latestBookResult.data as LatestBookRow | null) ?? null);
  const latestReadingProgress = mapLatestReadingProgress(
    (latestProgressResult.data as LatestReadingProgressRow | null) ?? null,
  );

  if (latestReadingProgress?.book_id) {
    const { data: relatedBook, error: relatedBookError } = await supabase
      .from("books")
      .select("title")
      .eq("id", latestReadingProgress.book_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (relatedBookError) {
      console.error("getDashboardData related book query error:", relatedBookError.message);
    } else {
      latestReadingProgress.book_title =
        typeof relatedBook?.title === "string" ? relatedBook.title : null;
    }
  }

  return {
    creditsBalance,
    booksCount,
    vocabularyCount,
    latestBook,
    latestReadingProgress,
  };
}