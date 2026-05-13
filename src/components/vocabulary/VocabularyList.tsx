import { EmptyVocabularyState } from "@/components/vocabulary/EmptyVocabularyState";
import { VocabularyCard } from "@/components/vocabulary/VocabularyCard";
import { Card } from "@/components/ui/Card";
import type { VocabularyItem } from "@/types";

type VocabularyListProps = {
  items: VocabularyItem[];
  hasActiveFilters: boolean;
  bookTitlesById: Record<string, string>;
};

export function VocabularyList({ items, hasActiveFilters, bookTitlesById }: VocabularyListProps) {
  if (items.length === 0) {
    if (hasActiveFilters) {
      return (
        <Card
          title="No vocabulary matches your filters."
          description="Try a broader search or reset one of the filters."
          className="text-center"
        />
      );
    }

    return <EmptyVocabularyState />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <VocabularyCard
          key={item.id || `${item.book_id}-${item.term}-${item.created_at}`}
          item={item}
          bookTitle={bookTitlesById[item.book_id]}
        />
      ))}
    </div>
  );
}
