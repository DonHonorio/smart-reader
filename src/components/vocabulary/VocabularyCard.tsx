import { Card } from "@/components/ui/Card";
import type { VocabularyItem } from "@/types";

type VocabularyCardProps = {
  item: VocabularyItem;
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

export function VocabularyCard({ item }: VocabularyCardProps) {
  const term = normalizeText(item.term) || "Untitled term";
  const selectedText = normalizeText(item.selected_text);
  const canonicalUnit = normalizeText(item.canonical_unit);
  const translation = normalizeText(item.translation);
  const contextSentence = normalizeText(item.context_sentence);
  const unitType = normalizeText(item.unit_type) || "unknown";
  const confidence = normalizeText(item.confidence) || "unknown";

  const showSelectedText =
    selectedText.length > 0 && selectedText.toLowerCase() !== term.toLowerCase();
  const showCanonicalUnit =
    canonicalUnit.length > 0 && canonicalUnit.toLowerCase() !== term.toLowerCase();

  return (
    <Card className="h-full p-4 sm:p-5" title={term} description={translation}>
      <div className="space-y-3 text-sm text-slate-600">
        {showSelectedText && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected text</p>
            <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-slate-700">{selectedText}</p>
          </div>
        )}

        {showCanonicalUnit && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Canonical unit</p>
            <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-slate-700">{canonicalUnit}</p>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context</p>
          <p className="max-h-24 overflow-auto rounded-lg bg-slate-50 px-2 py-1.5 leading-6 text-slate-700">
            {contextSentence}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 px-2 py-1.5">
            <dt className="uppercase tracking-wide">Type</dt>
            <dd className="mt-1 text-sm font-medium text-slate-700">{unitType}</dd>
          </div>
          <div className="rounded-md border border-slate-200 px-2 py-1.5">
            <dt className="uppercase tracking-wide">Confidence</dt>
            <dd className="mt-1 text-sm font-medium text-slate-700">{confidence}</dd>
          </div>
          <div className="rounded-md border border-slate-200 px-2 py-1.5">
            <dt className="uppercase tracking-wide">Saved</dt>
            <dd className="mt-1 text-sm font-medium text-slate-700">{formatCreatedAt(item.created_at)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}