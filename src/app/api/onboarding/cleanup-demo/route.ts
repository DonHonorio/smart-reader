import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Authentication required.", 401);
  }

  const { data: onboardingBooks, error: queryError } = await supabase
    .from("books")
    .select("id")
    .eq("user_id", user.id)
    .eq("title", "Onboarding Demo")
    .eq("author", "Smart-Reader")
    .is("file_path", null);

  if (queryError) {
    return jsonError("Could not find tutorial book.", 500);
  }

  const bookIds = (onboardingBooks ?? []).map((book) => book.id);

  if (bookIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deletedBooks: 0,
      deletedVocabularyItems: 0,
    });
  }

  const { error: vocabularyDeleteError, count: deletedVocabularyItems } = await supabase
    .from("vocabulary_items")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .in("book_id", bookIds);

  if (vocabularyDeleteError) {
    return jsonError("Could not remove tutorial vocabulary.", 500);
  }

  const { error: booksDeleteError, count: deletedBooks } = await supabase
    .from("books")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .in("id", bookIds);

  if (booksDeleteError) {
    return jsonError("Could not remove tutorial book.", 500);
  }

  return NextResponse.json({
    ok: true,
    deletedBooks: deletedBooks ?? 0,
    deletedVocabularyItems: deletedVocabularyItems ?? 0,
  });
}
