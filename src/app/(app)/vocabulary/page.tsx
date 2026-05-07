import { EmptyVocabularyState } from "@/components/vocabulary/EmptyVocabularyState";
import { VocabularyCard } from "@/components/vocabulary/VocabularyCard";
import { getUserVocabularyItems } from "@/lib/vocabulary";

export default async function VocabularyPage() {
  const items = await getUserVocabularyItems();
  const hasItems = items.length > 0;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Vocabulary</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Your saved terms, expressions, and context sentences collected while reading.
        </p>
      </header>

      {!hasItems ? (
        <EmptyVocabularyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <VocabularyCard key={item.id || `${item.book_id}-${item.term}-${item.created_at}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
