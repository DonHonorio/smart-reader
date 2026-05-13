import { Card } from "@/components/ui/Card";
import type { VocabularyItem } from "@/types";

type VocabularyCardProps = {
  item: VocabularyItem;
  bookTitle?: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBadgeLabel(value: string | null | undefined) {
  const normalized = normalizeText(value) || "unknown";

  return normalized
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function VocabularyCard({ item, bookTitle }: VocabularyCardProps) {
  const term = normalizeText(item.term) || "Untitled term";
  const selectedText = normalizeText(item.selected_text);
  const canonicalUnit = normalizeText(item.canonical_unit);
  const translation = normalizeText(item.translation) || "No translation";
  const contextSentence = normalizeText(item.context_sentence) || "No context sentence available.";
  const displayTitle = canonicalUnit || term;
  const unitTypeLabel = formatBadgeLabel(item.unit_type);
  const confidenceLabel = formatBadgeLabel(item.confidence);

  const showSelectedText =
    selectedText.length > 0 && selectedText.toLowerCase() !== term.toLowerCase();
  const showDictionaryForm =
    canonicalUnit.length > 0 && canonicalUnit.toLowerCase() !== term.toLowerCase();

  return (
    <Card className="h-full p-4 sm:p-5">
      <div className="flex h-full flex-col gap-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {unitTypeLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {confidenceLabel}
            </span>
            {bookTitle && (
              <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {bookTitle}
              </span>
            )}
          </div>

          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{displayTitle}</h2>

          {showDictionaryForm && (
            <p className="text-xs text-slate-500">
              Dictionary form: <span className="font-medium text-slate-700">{canonicalUnit}</span>
            </p>
          )}
        </header>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Translation</p>
          <p className="mt-1 text-base font-semibold text-emerald-900">{translation}</p>
        </section>

        {showSelectedText && (
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected text</p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{selectedText}</p>
          </section>
        )}

        <section className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context</p>
          <p className="max-h-28 overflow-auto rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
            {contextSentence}
          </p>
        </section>

        <p className="mt-auto text-xs text-slate-500">Saved {formatCreatedAt(item.created_at)}</p>
      </div>
    </Card>
  );
}