"use client";

import { useEffect, useState } from "react";
import type { VocabularyItem } from "@/types";

type OnboardingVocabularyViewProps = {
  onExport?: () => void;
  showExportButton?: boolean;
};

export function OnboardingVocabularyView({
  onExport,
  showExportButton = true,
}: OnboardingVocabularyViewProps) {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVocabulary() {
      try {
        const response = await fetch("/api/vocabulary?limit=50&sort=newest");
        if (response.ok) {
          const data = (await response.json()) as { items?: VocabularyItem[] };
          setItems(data.items || []);
        }
      } catch {
        // Silently fail
      } finally {
        setIsLoading(false);
      }
    }

    fetchVocabulary();
  }, []);

  async function handleExport() {
    setExportError(null);

    try {
      const response = await fetch("/api/export/anki", {
        method: "GET",
      });

      if (!response.ok) {
        setExportError("Could not export vocabulary right now. Please try again.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smart-reader-vocabulary.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      onExport?.();
    } catch {
      setExportError("Could not export vocabulary right now. Please try again.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-slate-500">Loading vocabulary...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-slate-600">No vocabulary saved yet.</p>
        <p className="text-xs text-slate-500">
          Go back to the reader and select some text to build your vocabulary!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-2">
        {items.slice(0, 5).map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="text-sm font-semibold text-slate-900">{item.canonical_unit || item.term}</p>
            <p className="text-xs text-emerald-700">{item.translation}</p>
          </div>
        ))}
      </div>

      {items.length > 5 && (
        <p className="text-xs text-slate-500">
          ... and {items.length - 5} more expressions
        </p>
      )}

      {showExportButton ? (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={handleExport}
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            Export as CSV
          </button>
          {exportError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
              {exportError}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
