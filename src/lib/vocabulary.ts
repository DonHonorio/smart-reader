import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VocabularyItem } from "@/types";

const VOCABULARY_FIELDS =
  "id, user_id, book_id, selected_text, term, canonical_unit, translation, context_sentence, unit_type, confidence, status, created_at";

export async function getUserVocabularyItems(): Promise<VocabularyItem[]> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserVocabularyItems auth error:", authError.message);
    return [];
  }

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("vocabulary_items")
    .select(VOCABULARY_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getUserVocabularyItems query error:", error.message);
    return [];
  }

  return (data ?? []) as VocabularyItem[];
}