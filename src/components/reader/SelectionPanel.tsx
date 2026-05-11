"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SaveVocabularyRequest, SaveVocabularyResponse } from "@/types";

const MAX_SELECTED_TEXT_LENGTH = 300;
const SELECTED_TEXT_TOO_LONG_ERROR =
  "Selected text is too long. Please select a shorter word or phrase.";

type SelectionPanelProps = {
  bookId: string;
  selectedText: string;
  contextSentence: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  onClear: () => void;
};

type NormalizedTranslation = {
  selectedText: string;
  surfaceUnit: string;
  canonicalUnit: string;
  translation: string;
  isExpanded: boolean;
  unitType: string;
  confidence: string;
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getNormalizedString(value: unknown) {
  return typeof value === "string" ? normalizeText(value) : "";
}

function normalizeTranslatePayload(payload: Record<string, unknown>): NormalizedTranslation | null {
  const normalizedSelectedText = getNormalizedString(payload.selectedText);
  const normalizedTranslation = getNormalizedString(payload.translation);
  const normalizedLegacyUnit = getNormalizedString(payload.translationUnit);
  const normalizedSurfaceUnit =
    getNormalizedString(payload.surfaceUnit) || normalizedLegacyUnit || normalizedSelectedText;
  const normalizedCanonicalUnit =
    getNormalizedString(payload.canonicalUnit) || normalizedSurfaceUnit;
  const normalizedUnitType = getNormalizedString(payload.unitType) || "phrase";
  const normalizedConfidence = getNormalizedString(payload.confidence) || "medium";
  const isExpandedFromPayload =
    typeof payload.isExpanded === "boolean"
      ? payload.isExpanded
      : normalizedSurfaceUnit.toLowerCase() !== normalizedSelectedText.toLowerCase();

  if (
    !normalizedSelectedText ||
    !normalizedSurfaceUnit ||
    !normalizedCanonicalUnit ||
    !normalizedTranslation
  ) {
    return null;
  }

  return {
    selectedText: normalizedSelectedText,
    surfaceUnit: normalizedSurfaceUnit,
    canonicalUnit: normalizedCanonicalUnit,
    translation: normalizedTranslation,
    isExpanded: isExpandedFromPayload,
    unitType: normalizedUnitType,
    confidence: normalizedConfidence,
  };
}

export function SelectionPanel({
  bookId,
  selectedText,
  contextSentence,
  sourceLanguage,
  targetLanguage,
  onClear,
}: SelectionPanelProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [translationState, setTranslationState] = useState<{
    key: string;
    value: NormalizedTranslation;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [saveState, setSaveState] = useState<{
    key: string;
    status: "created" | "already_exists" | "error";
    message: string;
  } | null>(null);

  const selectionKey = useMemo(
    () => `${sourceLanguage}|${targetLanguage}|${selectedText}|${contextSentence ?? ""}`,
    [sourceLanguage, targetLanguage, selectedText, contextSentence],
  );

  const translation = translationState?.key === selectionKey ? translationState.value : null;
  const errorMessage = errorState?.key === selectionKey ? errorState.message : null;
  const currentSaveState = saveState?.key === selectionKey ? saveState : null;
  const isSaved =
    currentSaveState?.status === "created" ||
    currentSaveState?.status === "already_exists";
  const saveErrorMessage = currentSaveState?.status === "error" ? currentSaveState.message : null;
  const saveSuccessMessage = isSaved ? currentSaveState?.message ?? null : null;
  const saveButtonLabel =
    currentSaveState?.status === "already_exists"
      ? "Already saved"
      : currentSaveState?.status === "created"
        ? "Saved"
        : isSaving
          ? "Saving..."
          : "Save";

  async function handleTranslate() {
    if (!selectedText || isTranslating) {
      return;
    }

    if (selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
      setErrorState({
        key: selectionKey,
        message: SELECTED_TEXT_TOO_LONG_ERROR,
      });
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

      let data: (Record<string, unknown> & { error?: string }) | null = null;

      try {
        data = (await response.json()) as Record<string, unknown> & {
          error?: string;
        };
      } catch {
        data = null;
      }

      if (!response.ok) {
        const serverError =
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : "Could not translate right now.";

        throw new Error(serverError);
      }

      const normalizedTranslation = normalizeTranslatePayload(data ?? {});

      if (!normalizedTranslation) {
        throw new Error("Empty translation response.");
      }

      setTranslationState({
        key: selectionKey,
        value: normalizedTranslation,
      });
      setSaveState(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "Could not translate right now.";

      setErrorState({ key: selectionKey, message });
    } finally {
      setIsTranslating(false);
    }
  }

  async function handleSave() {
    if (!translation || isSaving || isSaved) {
      return;
    }

    const normalizedContextSentence = getNormalizedString(contextSentence);

    if (!normalizedContextSentence) {
      setSaveState({
        key: selectionKey,
        status: "error",
        message: "Context is required before saving.",
      });
      return;
    }

    setIsSaving(true);
    setSaveState(null);

    try {
      const body: SaveVocabularyRequest = {
        bookId,
        selectedText: translation.selectedText,
        term: translation.surfaceUnit,
        canonicalUnit: translation.canonicalUnit,
        translation: translation.translation,
        contextSentence: normalizedContextSentence,
        unitType: translation.unitType,
        confidence: translation.confidence,
      };

      const response = await fetch("/api/vocabulary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as Partial<SaveVocabularyResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Save request failed.");
      }

      if (typeof data.item !== "object" || data.item === null) {
        throw new Error("Save request failed.");
      }

      if (data.status !== "created" && data.status !== "already_exists") {
        throw new Error("Save request failed.");
      }

      const message = data.status === "already_exists" ? "Already saved" : "Saved";

      setSaveState({
        key: selectionKey,
        status: data.status,
        message,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "Could not save right now.";

      setSaveState({
        key: selectionKey,
        status: "error",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleClear() {
    setTranslationState(null);
    setErrorState(null);
    setSaveState(null);
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
            {translation.surfaceUnit}
          </p>

          {translation.isExpanded && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Expression detected: translated &quot;{translation.surfaceUnit}&quot;, not just &quot;
              {translation.selectedText}
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
          disabled={!selectedText || isTranslating || isSaving}
        >
          {isTranslating ? "Translating..." : "Translate"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={!translation || isSaving || isSaved}
        >
          {saveButtonLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
      </div>

      {saveSuccessMessage && (
        <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          {saveSuccessMessage}
        </p>
      )}

      {saveErrorMessage && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {saveErrorMessage}
        </p>
      )}
    </section>
  );
}
