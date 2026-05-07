"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { TranslateResponse } from "@/types";

type SelectionPanelProps = {
  selectedText: string;
  contextSentence: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  onClear: () => void;
};

export function SelectionPanel({
  selectedText,
  contextSentence,
  sourceLanguage,
  targetLanguage,
  onClear,
}: SelectionPanelProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationState, setTranslationState] = useState<{
    key: string;
    value: TranslateResponse;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const selectionKey = useMemo(
    () => `${sourceLanguage}|${targetLanguage}|${selectedText}|${contextSentence ?? ""}`,
    [sourceLanguage, targetLanguage, selectedText, contextSentence],
  );

  const translation = translationState?.key === selectionKey ? translationState.value : null;
  const errorMessage = errorState?.key === selectionKey ? errorState.message : null;

  async function handleTranslate() {
    if (!selectedText || isTranslating) {
      return;
    }

    setIsTranslating(true);
    setErrorState(null);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedText,
          contextSentence,
          sourceLanguage,
          targetLanguage,
        }),
      });

      const data = (await response.json()) as Partial<TranslateResponse> & {
        error?: string;
      };

      if (
        !response.ok ||
        typeof data.selectedText !== "string" ||
        typeof data.translationUnit !== "string" ||
        typeof data.translation !== "string" ||
        typeof data.isExpanded !== "boolean" ||
        typeof data.unitType !== "string"
      ) {
        throw new Error(data.error || "Translation request failed.");
      }

      const normalizedTranslationUnit = data.translationUnit.trim();
      const normalizedTranslation = data.translation.trim();

      if (!normalizedTranslationUnit || !normalizedTranslation) {
        throw new Error("Empty translation response.");
      }

      setTranslationState({
        key: selectionKey,
        value: {
          selectedText: data.selectedText,
          translationUnit: normalizedTranslationUnit,
          translation: normalizedTranslation,
          isExpanded: data.isExpanded,
          unitType: data.unitType,
        },
      });
    } catch {
      setErrorState({ key: selectionKey, message: "Could not translate right now." });
    } finally {
      setIsTranslating(false);
    }
  }

  function handleClear() {
    setTranslationState(null);
    setErrorState(null);
    onClear();
  }

  return (
    <section className="w-full max-h-[40vh] overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected text</p>
        <p className="max-h-20 overflow-auto rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
          {selectedText}
        </p>
      </div>

      {contextSentence && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context</p>
          <p className="max-h-24 overflow-auto rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
            {contextSentence}
          </p>
        </div>
      )}

      {translation && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Translated expression
          </p>
          <p className="max-h-16 overflow-auto rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
            {translation.translationUnit}
          </p>

          {translation.isExpanded && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Expression detected: translated &quot;{translation.translationUnit}&quot;, not just &quot;
              {selectedText}
              &quot;.
            </p>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Translation</p>
          <p className="max-h-24 overflow-auto rounded-md bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800">
            {translation.translation}
          </p>
        </div>
      )}

      {errorMessage && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleTranslate}
          disabled={!selectedText || isTranslating}
        >
          {isTranslating ? "Translating..." : "Translate"}
        </Button>
        <Button variant="secondary" size="sm" disabled>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
      </div>
    </section>
  );
}
