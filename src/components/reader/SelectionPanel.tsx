"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  confidenceScoreToLabel,
  fetchBookTranslationByCfi,
  isPersistedTranslationId,
  logBookTranslationEvent,
} from "@/lib/bookTranslations";
import {
  VOCABULARY_SAVE_MISSING_CONTEXT_ERROR,
  logVocabularySaveEvent,
  requestVocabularySave,
} from "@/lib/vocabularySave";
import { cn } from "@/lib/utils";
import type {
  BookTranslation,
  CreateBookTranslationRequest,
  SaveVocabularyRequest,
  SelectionPanelState,
} from "@/types";

const MAX_SELECTED_TEXT_LENGTH = 300;
const SELECTED_TEXT_TOO_LONG_ERROR =
  "Selected text is too long. Please select a shorter word or phrase.";
const TRANSLATION_GENERIC_ERROR =
  "Translation is temporarily unavailable. Please try again in a moment.";

function normalizeTranslationErrorMessage(value: unknown) {
  const rawMessage = value instanceof Error ? value.message : "";
  const normalizedMessage = rawMessage.trim();

  if (!normalizedMessage) {
    return TRANSLATION_GENERIC_ERROR;
  }

  const technicalErrorPatterns = [
    "Empty translation response",
    "Invalid JSON translation response",
    "Missing translationUnit or translation",
    "Invalid unitType",
    "Invalid isExpanded",
  ];

  if (technicalErrorPatterns.some((pattern) => normalizedMessage.includes(pattern))) {
    return TRANSLATION_GENERIC_ERROR;
  }

  return normalizedMessage;
}

type SelectionPanelProps = {
  bookId: string;
  selectedText: string;
  contextSentence: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  variant?: "desktop" | "mobile";
  /** EPUB position of the current selection or highlighted range. */
  cfiRange?: string | null;
  chapterHref?: string | null;
  /** Already persisted translation for this position, when the reader knows it. */
  storedTranslation?: BookTranslation | null;
  isVocabularyAlreadySaved?: boolean;
  onStoredTranslationFound?: (translation: BookTranslation) => void;
  onTranslationReady?: (cfiRange: string) => void;
  onPersistTranslation?: (
    input: CreateBookTranslationRequest,
  ) => Promise<BookTranslation | null>;
  /** Called as soon as the user clicks Save, before the request resolves. */
  onVocabularySaved?: (bookTranslationId: string) => void;
  /** Called when that optimistic save could not be persisted. */
  onVocabularySaveFailed?: (bookTranslationId: string) => void;
};

/**
 * One entry per selection. The panel instance is reused across selections, so the save
 * state can never be a single flag: a slow answer for one range must not repaint another.
 */
type VocabularySaveEntry = {
  /** `saving` is already an optimistic save: the button reads Saved from that moment. */
  status: "saving" | "saved" | "error";
  message: string | null;
  alreadyExisted: boolean;
  vocabularyItemId: string | null;
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

function toNormalizedTranslation(stored: BookTranslation): NormalizedTranslation {
  const normalizedSelectedText = normalizeText(stored.selectedText);
  const surfaceUnit = normalizeText(stored.detectedExpression ?? "") || normalizedSelectedText;
  const canonicalUnit = normalizeText(stored.baseForm ?? "") || surfaceUnit;

  return {
    selectedText: normalizedSelectedText,
    surfaceUnit,
    canonicalUnit,
    translation: normalizeText(stored.translation),
    isExpanded: surfaceUnit.toLowerCase() !== normalizedSelectedText.toLowerCase(),
    unitType: normalizeText(stored.unitType ?? "") || "phrase",
    confidence: confidenceScoreToLabel(stored.confidence),
  };
}

export function SelectionPanel({
  bookId,
  selectedText,
  contextSentence,
  sourceLanguage,
  targetLanguage,
  variant = "desktop",
  cfiRange = null,
  chapterHref = null,
  storedTranslation = null,
  isVocabularyAlreadySaved = false,
  onStoredTranslationFound,
  onTranslationReady,
  onPersistTranslation,
  onVocabularySaved,
  onVocabularySaveFailed,
}: SelectionPanelProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationState, setTranslationState] = useState<{
    key: string;
    value: NormalizedTranslation;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [saveEntriesByKey, setSaveEntriesByKey] = useState<Record<string, VocabularySaveEntry>>({});
  const [persistedTranslationState, setPersistedTranslationState] = useState<{
    key: string;
    id: string;
  } | null>(null);

  // In-flight saves by selection. A ref, not state: the button already reads as saved
  // through the optimistic entry, so a second click needs no re-render to be ignored.
  const pendingSaveKeysRef = useRef(new Set<string>());
  const saveAttemptIdRef = useRef(0);
  const latestSaveAttemptByKeyRef = useRef(new Map<string, number>());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      // The request is not cancelled: it finishes and updates the reader cache.
      // Only React state updates stop here.
      isMountedRef.current = false;
    };
  }, []);

  const selectionKey = useMemo(
    () =>
      `${sourceLanguage}|${targetLanguage}|${cfiRange ?? ""}|${selectedText}|${contextSentence ?? ""}`,
    [sourceLanguage, targetLanguage, cfiRange, selectedText, contextSentence],
  );

  const storedNormalizedTranslation = useMemo(
    () => (storedTranslation ? toNormalizedTranslation(storedTranslation) : null),
    [storedTranslation],
  );

  const aiTranslation = translationState?.key === selectionKey ? translationState.value : null;
  const translation = aiTranslation ?? storedNormalizedTranslation;
  const errorMessage = errorState?.key === selectionKey ? errorState.message : null;
  const hasSuccessfulTranslation = Boolean(translation) && !errorMessage;
  const currentSaveEntry = saveEntriesByKey[selectionKey] ?? null;
  const isSavedInThisPanel =
    currentSaveEntry?.status === "saving" || currentSaveEntry?.status === "saved";
  const isSaved = isVocabularyAlreadySaved || isSavedInThisPanel;
  const saveErrorMessage = currentSaveEntry?.status === "error" ? currentSaveEntry.message : null;
  const saveSuccessMessage = isSavedInThisPanel ? currentSaveEntry?.message ?? null : null;
  // Optimistic: the button reads Saved from the click, not from the server answer.
  const saveButtonLabel = isSaved ? "Saved" : "Save";

  const panelState: SelectionPanelState | null = !translation
    ? null
    : isSaved
      ? "saved_vocabulary"
      : aiTranslation
        ? "new_translation"
        : "stored_translation";

  // idle -> saving -> saved, or back to idle through error. Exposed for QA like
  // `data-panel-state`; the visible design does not change.
  const vocabularySaveState: "idle" | "saving" | "saved" | "error" =
    currentSaveEntry?.status ?? (isVocabularyAlreadySaved ? "saved" : "idle");

  const linkedBookTranslationId =
    persistedTranslationState?.key === selectionKey
      ? persistedTranslationState.id
      : isPersistedTranslationId(storedTranslation?.id)
        ? storedTranslation.id
        : null;

  function setSaveEntry(key: string, entry: VocabularySaveEntry) {
    setSaveEntriesByKey((entries) => ({ ...entries, [key]: entry }));
  }

  function clearSaveEntry(key: string) {
    setSaveEntriesByKey((entries) => {
      if (!entries[key]) {
        return entries;
      }

      const nextEntries = { ...entries };
      delete nextEntries[key];

      return nextEntries;
    });
  }

  function persistTranslationInBackground(value: NormalizedTranslation) {
    if (!cfiRange || !onPersistTranslation) {
      return;
    }

    const input: CreateBookTranslationRequest = {
      bookId,
      cfiRange,
      chapterHref,
      selectedText: value.selectedText,
      contextSentence,
      detectedExpression: value.surfaceUnit,
      baseForm: value.canonicalUnit,
      translation: value.translation,
      unitType: value.unitType,
      confidence: value.confidence,
      sourceLanguage,
      targetLanguage,
    };

    // Persistence never blocks the panel: a failure keeps the translation visible.
    void onPersistTranslation(input).then((persisted) => {
      if (!persisted || !isPersistedTranslationId(persisted.id)) {
        return;
      }

      setPersistedTranslationState({ key: selectionKey, id: persisted.id });
    });
  }

  async function handleTranslate() {
    if (!selectedText || isTranslating || translation) {
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
      // Authoritative position lookup before spending an AI call.
      if (cfiRange) {
        const existingTranslation = await fetchBookTranslationByCfi({
          bookId,
          cfiRange,
          targetLanguage,
        });

        if (existingTranslation) {
          logBookTranslationEvent("FOUND");
          onStoredTranslationFound?.(existingTranslation);
          return;
        }
      }

      logBookTranslationEvent("AI_REQUIRED");

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
            : TRANSLATION_GENERIC_ERROR;

        throw new Error(serverError);
      }

      const normalizedTranslation = normalizeTranslatePayload(data ?? {});

      if (!normalizedTranslation) {
        throw new Error(TRANSLATION_GENERIC_ERROR);
      }

      setTranslationState({
        key: selectionKey,
        value: normalizedTranslation,
      });
      clearSaveEntry(selectionKey);
      setPersistedTranslationState(null);

      if (cfiRange) {
        // Optimistic highlight first, then persist without blocking the panel.
        onTranslationReady?.(cfiRange);
        persistTranslationInBackground(normalizedTranslation);
      }
    } catch (error) {
      const message = normalizeTranslationErrorMessage(error);

      setErrorState({ key: selectionKey, message });
    } finally {
      setIsTranslating(false);
    }
  }

  /**
   * Runs while the panel is open and survives it being closed. It never awaits before
   * the optimistic update, so the button flips to Saved on the click itself.
   */
  async function runVocabularySave(params: {
    key: string;
    attemptId: number;
    bookTranslationId: string | null;
    body: SaveVocabularyRequest;
  }) {
    const { attemptId, body, bookTranslationId, key } = params;
    const startedAt = Date.now();

    logVocabularySaveEvent("REQUEST_STARTED", {
      bookTranslationId,
      attemptId,
    });

    const result = await requestVocabularySave(body);
    const durationMs = Date.now() - startedAt;

    pendingSaveKeysRef.current.delete(key);

    // A late answer only owns the state if it is still the newest attempt for its own
    // selection. Anything else belongs to a selection the user already left behind.
    if (latestSaveAttemptByKeyRef.current.get(key) !== attemptId) {
      logVocabularySaveEvent("STALE_RESPONSE_IGNORED", {
        bookTranslationId,
        attemptId,
        durationMs,
      });
      return;
    }

    if (result.ok) {
      logVocabularySaveEvent(result.alreadyExisted ? "ALREADY_EXISTS" : "SAVED", {
        bookTranslationId,
        attemptId,
        durationMs,
      });

      // Confirms the optimistic entry the reader already holds; adding it twice is a no-op.
      if (bookTranslationId) {
        onVocabularySaved?.(bookTranslationId);
      }

      if (!isMountedRef.current) {
        return;
      }

      setSaveEntry(key, {
        status: "saved",
        message: result.alreadyExisted ? "Already saved" : "Saved",
        alreadyExisted: result.alreadyExisted,
        vocabularyItemId: result.item.id || null,
      });

      return;
    }

    logVocabularySaveEvent("FAILED", {
      bookTranslationId,
      attemptId,
      durationMs,
      code: result.code,
    });
    logVocabularySaveEvent("ROLLBACK", { bookTranslationId, attemptId });

    // The translation and its highlight stay untouched: only the vocabulary link is undone.
    if (bookTranslationId) {
      onVocabularySaveFailed?.(bookTranslationId);
    }

    if (!isMountedRef.current) {
      return;
    }

    setSaveEntry(key, {
      status: "error",
      message: result.message,
      alreadyExisted: false,
      vocabularyItemId: null,
    });
  }

  function handleSave() {
    if (!translation || isSaved) {
      return;
    }

    if (pendingSaveKeysRef.current.has(selectionKey)) {
      logVocabularySaveEvent("DUPLICATE_CLICK_IGNORED", {
        bookTranslationId: linkedBookTranslationId,
      });
      return;
    }

    const normalizedContextSentence = getNormalizedString(contextSentence);

    if (!normalizedContextSentence) {
      setSaveEntry(selectionKey, {
        status: "error",
        message: VOCABULARY_SAVE_MISSING_CONTEXT_ERROR,
        alreadyExisted: false,
        vocabularyItemId: null,
      });
      return;
    }

    const attemptId = saveAttemptIdRef.current + 1;
    saveAttemptIdRef.current = attemptId;
    pendingSaveKeysRef.current.add(selectionKey);
    latestSaveAttemptByKeyRef.current.set(selectionKey, attemptId);

    const body: SaveVocabularyRequest = {
      bookId,
      selectedText: translation.selectedText,
      term: translation.surfaceUnit,
      canonicalUnit: translation.canonicalUnit,
      translation: translation.translation,
      contextSentence: normalizedContextSentence,
      unitType: translation.unitType,
      confidence: translation.confidence,
      bookTranslationId: linkedBookTranslationId,
    };

    // 1. The interface commits first.
    setSaveEntry(selectionKey, {
      status: "saving",
      message: "Saved",
      alreadyExisted: false,
      vocabularyItemId: null,
    });

    // Reopening this highlight must already read as saved, even if the panel closes
    // before the request lands.
    if (linkedBookTranslationId) {
      onVocabularySaved?.(linkedBookTranslationId);
    }

    logVocabularySaveEvent("OPTIMISTIC_UPDATE", {
      bookTranslationId: linkedBookTranslationId,
      attemptId,
    });

    // 2. Supabase catches up afterwards, without blocking panel, reader or swipe.
    void runVocabularySave({
      key: selectionKey,
      attemptId,
      bookTranslationId: linkedBookTranslationId,
      body,
    });
  }

  const isMobileVariant = variant === "mobile";

  return (
    <section
      // Exposed for debugging/manual QA only; the panel design is unchanged.
      data-panel-state={panelState ?? "empty"}
      data-vocabulary-save-state={vocabularySaveState}
      data-vocabulary-item-id={currentSaveEntry?.vocabularyItemId ?? undefined}
      className={cn(
        "w-full overflow-auto border shadow-xl",
        isMobileVariant
          ? "max-h-[34vh] rounded-xl border-slate-200 bg-white p-2.5"
          : "max-h-[50vh] rounded-2xl border-slate-200/90 bg-white/95 p-3 backdrop-blur",
      )}
    >
      <div className={cn("space-y-2", isMobileVariant && "space-y-1") }>
        {!isMobileVariant && (
          <p className="select-none text-xs font-semibold uppercase tracking-wide text-slate-500">
            SELECTED TEXT
          </p>
        )}
        <p
          className={cn(
            "overflow-auto rounded-md bg-slate-50 text-slate-800",
            isMobileVariant ? "max-h-16 px-2 py-1.5 text-xs" : "max-h-20 px-2 py-1.5 text-sm",
          )}
        >
          {selectedText}
        </p>
      </div>

      {contextSentence && (
        <div className={cn("space-y-2", isMobileVariant ? "mt-2 space-y-1" : "mt-3")}>
          {!isMobileVariant && (
            <p className="select-none text-xs font-semibold uppercase tracking-wide text-slate-500">
              Context
            </p>
          )}
          <p
            className={cn(
              "overflow-auto rounded-md bg-slate-50 text-slate-700",
              isMobileVariant ? "max-h-20 px-2 py-1.5 text-xs" : "max-h-24 px-2 py-1.5 text-sm",
            )}
          >
            {contextSentence}
          </p>
        </div>
      )}

      {translation && (
        <div className={cn("space-y-2", isMobileVariant ? "mt-2 space-y-1" : "mt-3")}>
          <p
            className={cn(
              "select-none font-semibold uppercase text-slate-500",
              isMobileVariant ? "text-[11px] tracking-[0.08em]" : "text-xs tracking-wide",
            )}
          >
            Translated expression
          </p>
          <p
            className={cn(
              "overflow-auto rounded-md bg-slate-50 text-slate-800",
              isMobileVariant ? "max-h-14 px-2 py-1.5 text-sm leading-5" : "max-h-16 px-2 py-1.5 text-sm",
            )}
          >
            {translation.surfaceUnit}
          </p>

          {translation.isExpanded && (
            <p
              className={cn(
                "rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800",
                isMobileVariant ? "text-[11px] leading-4" : "text-xs",
              )}
            >
              Expression detected: translated &quot;{translation.surfaceUnit}&quot;, not just &quot;
              {translation.selectedText}
              &quot;.
            </p>
          )}

          {!isMobileVariant && (
            <p className="select-none text-xs font-semibold uppercase tracking-wide text-slate-500">
              Translation
            </p>
          )}
          <p
            className={cn(
              "overflow-auto rounded-md bg-emerald-50 text-emerald-800",
              isMobileVariant ? "max-h-20 px-2 py-1.5 text-xs" : "max-h-24 px-2 py-1.5 text-sm",
            )}
          >
            {translation.translation}
          </p>
        </div>
      )}

      {errorMessage && (
        <p
          className={cn(
            "rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-red-700",
            isMobileVariant ? "mt-2 text-xs" : "mt-3 text-sm",
          )}
        >
          {errorMessage}
        </p>
      )}

      <div className={cn("flex flex-wrap", isMobileVariant ? "mt-2 gap-1.5" : "mt-3 gap-2")}>
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            "select-none enabled:cursor-pointer",
            isMobileVariant && "h-8 rounded-md px-2.5 text-xs",
          )}
          onClick={handleTranslate}
          disabled={!selectedText || isTranslating || hasSuccessfulTranslation}
        >
          {isTranslating ? "Translating..." : hasSuccessfulTranslation ? "Translated" : "Translate"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            "select-none enabled:cursor-pointer",
            isMobileVariant && "h-8 rounded-md px-2.5 text-xs",
          )}
          onClick={handleSave}
          disabled={!translation || isSaved}
        >
          {saveButtonLabel}
        </Button>
      </div>

      {saveSuccessMessage && (
        <p
          className={cn(
            "mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700",
            isMobileVariant ? "text-[11px]" : "text-xs",
          )}
        >
          {saveSuccessMessage}
        </p>
      )}

      {saveErrorMessage && (
        <p
          className={cn(
            "mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700",
            isMobileVariant ? "text-[11px]" : "text-xs",
          )}
        >
          {saveErrorMessage}
        </p>
      )}
    </section>
  );
}
