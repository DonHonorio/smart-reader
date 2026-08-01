"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ePub, { type Book as EpubBook, type Contents as EpubContents, type Rendition } from "epubjs";
import { ReaderControls } from "@/components/reader/ReaderControls";
import { ReaderSettingsPanel } from "@/components/reader/ReaderSettingsPanel";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { SelectionPanel } from "@/components/reader/SelectionPanel";
import {
  downloadEpubFromSignedUrl,
  getBookAccessErrorMessage,
  isAbortError,
  isRetryableBookAccessErrorCode,
  logBookAccessEvent,
  requestBookAccess,
} from "@/lib/bookAccess";
import {
  buildLocalBookTranslation,
  buildTranslationCacheKey,
  fetchChapterBookTranslations,
  isPersistedTranslationId,
  logBookTranslationEvent,
  persistBookTranslation,
} from "@/lib/bookTranslations";
import { ROUTES } from "@/lib/constants";
import { validateEpubArrayBuffer } from "@/lib/epubValidation";
import {
  createReaderPerformanceTracker,
  type ReaderPerformanceTracker,
} from "@/lib/readerPerformance";
import { extractContextSentenceFromSelection } from "@/lib/text";
import { cn } from "@/lib/utils";
import type {
  BookAccessErrorCode,
  BookTranslation,
  CreateBookTranslationRequest,
  EpubReaderProps,
  ReadingProgressSaveReason,
  ReaderLoadPhase,
  ReaderPreferences,
  ReaderTheme,
  UpsertReadingProgressRequest,
} from "@/types";

const STABLE_READING_SAVE_DEBOUNCE_MS = 2000;
const LOCATIONS_GENERATE_CHARS = 1000;
const LOCATIONS_CACHE_VERSION = "v3";
const LOCATIONS_CACHE_KEY_PREFIX = "smart-reader:locations:";
const INITIAL_RESTORE_SETTLE_MS = 500;
const READER_SETTINGS_SETTLE_MS = 700;
const PENDING_NAVIGATION_REASON_TIMEOUT_MS = 2000;
// Budget for a single access attempt (signed URL + download + open). The retry
// gets its own budget so one slow attempt cannot consume the whole allowance.
const READER_LOAD_TIMEOUT_MS = 10_000;
// One automatic retry with a brand new signed URL, never more.
const MAX_BOOK_ACCESS_ATTEMPTS = 2;

const READER_PREFERENCES_STORAGE_KEY = "smart-reader:reader-preferences:v1";
const DEFAULT_READER_THEME: ReaderTheme = "light";
const DEFAULT_READER_FONT_SIZE = 100;
const MIN_READER_FONT_SIZE = 80;
const MAX_READER_FONT_SIZE = 150;
const READER_FONT_SIZE_STEP = 10;
const DESKTOP_SPREAD_BREAKPOINT = 1024;
const DESKTOP_SINGLE_CLICK_DELAY_MS = 220;
// On touch devices a highlight emits "markClicked" on touchstart, so the click of that
// same tap arrives afterwards and must not close the panel it just opened.
const TOUCH_MARK_CLICK_FOLLOW_UP_MS = 500;
const INITIAL_RESTORE_PROGRESS_DELTA_THRESHOLD = 0.4;
const PANEL_VIEWPORT_MARGIN = 12;
const PANEL_SELECTION_GAP = 10;
const DESKTOP_PANEL_MAX_WIDTH = 420;
const MOBILE_PANEL_MAX_HEIGHT_VH = 40;
const MOBILE_SWIPE_THRESHOLD_PX = 40;

const EPUB_THEME_NAMES: Record<ReaderTheme, string> = {
  light: "smart-reader-light",
  sepia: "smart-reader-sepia",
  dark: "smart-reader-dark",
};

const READER_THEME_PALETTE: Record<
  ReaderTheme,
  {
    appBackground: string;
    appText: string;
    epubBackground: string;
    epubText: string;
    loadingOverlay: string;
  }
> = {
  light: {
    appBackground: "#fffaf5",
    appText: "#111827",
    epubBackground: "#fffaf5",
    epubText: "#111827",
    loadingOverlay: "rgba(255, 250, 245, 0.92)",
  },
  sepia: {
    appBackground: "#f4ecd8",
    appText: "#2f261d",
    epubBackground: "#f4ecd8",
    epubText: "#2f261d",
    loadingOverlay: "rgba(244, 236, 216, 0.92)",
  },
  dark: {
    appBackground: "#181818",
    appText: "#e5e7eb",
    epubBackground: "#181818",
    epubText: "#e5e7eb",
    loadingOverlay: "rgba(24, 24, 24, 0.9)",
  },
};

const EPUB_SELECTION_BACKGROUND = "#f1cafc";
const DARK_THEME_SELECTION_TEXT = "#111827";
const EPUB_SELECTION_STYLE_ELEMENT_ID = "smart-reader-selection-style";

const TRANSLATION_HIGHLIGHT_TYPE = "highlight";
const TRANSLATION_HIGHLIGHT_CLASS_NAME = "smart-reader-translation-highlight";

// Same family as the selection color so a translated range reads as "already translated"
// without competing with the text. Dark theme lightens instead of multiplying.
const TRANSLATION_HIGHLIGHT_STYLES: Record<ReaderTheme, Record<string, string>> = {
  light: {
    fill: EPUB_SELECTION_BACKGROUND,
    "fill-opacity": "0.45",
    "mix-blend-mode": "multiply",
  },
  sepia: {
    fill: EPUB_SELECTION_BACKGROUND,
    "fill-opacity": "0.5",
    "mix-blend-mode": "multiply",
  },
  dark: {
    fill: EPUB_SELECTION_BACKGROUND,
    "fill-opacity": "0.24",
    "mix-blend-mode": "screen",
  },
};

type RelocatedPayload = {
  percentage?: unknown;
  start?: {
    cfi?: unknown;
    href?: unknown;
    index?: unknown;
    percentage?: unknown;
    displayed?: {
      page?: unknown;
      total?: unknown;
    };
  };
  end?: {
    cfi?: unknown;
    href?: unknown;
    index?: unknown;
    percentage?: unknown;
    displayed?: {
      page?: unknown;
      total?: unknown;
    };
  };
};

type EpubLocations = {
  generate: (chars?: number) => Promise<unknown>;
  percentageFromCfi: (cfi: string) => unknown;
  cfiFromPercentage?: (percentage: number) => unknown;
  load?: (locations: unknown) => unknown;
  save?: () => unknown;
};

type RenditionThemesApi = {
  register: (name: string, rules: Record<string, Record<string, string>>) => unknown;
  select: (name: string) => unknown;
  fontSize: (size: string) => unknown;
};

type RenditionEventHandler = (...args: unknown[]) => void;

type RenditionEventApi = {
  on: (eventName: string, handler: RenditionEventHandler) => unknown;
  off: (eventName: string, handler: RenditionEventHandler) => unknown;
};

type RenditionContentHooksApi = {
  register: (handler: (contents: EpubContents) => void) => unknown;
};

type RenditionSpreadApi = {
  spread?: (value: "none" | "auto" | "always") => unknown;
};

type RenditionContentsApi = {
  getContents?: () => unknown;
};

type RenditionManagerApi = {
  container?: HTMLElement | null;
  scrollTo?: (x: number, y: number, silent?: boolean) => unknown;
};

type RenditionManagerRefApi = {
  manager?: RenditionManagerApi;
};

type RenditionAnnotationsApi = {
  add: (
    type: string,
    cfiRange: string,
    data?: Record<string, unknown>,
    cb?: (event: Event) => void,
    className?: string,
    styles?: Record<string, string>,
  ) => unknown;
  remove: (cfiRange: string, type: string) => unknown;
};

type EpubSpineApi = {
  get?: (target: string) => { href?: unknown } | null;
};

type SelectionAnchor = {
  centerX: number;
  top: number;
  bottom: number;
};

/**
 * Runtime activo de epub.js. `key` identifica el recurso (libro + recarga manual) y
 * `container` el nodo real: un doble montaje de React conserva el mismo nodo, mientras
 * que un desmontaje real crea uno nuevo. Esa diferencia distingue reutilizar de reconstruir.
 */
type ReaderRuntimeHandle = {
  key: string;
  container: HTMLDivElement;
  keepAlive: () => void;
  scheduleTeardown: () => void;
};

function getLocationsCacheKey(bookId: string) {
  return `${LOCATIONS_CACHE_KEY_PREFIX}${LOCATIONS_CACHE_VERSION}:${bookId}`;
}

function readCachedLocations(bookId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const serialized = window.localStorage.getItem(getLocationsCacheKey(bookId));

    if (typeof serialized !== "string") {
      return null;
    }

    const normalized = serialized.trim();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function persistCachedLocations(bookId: string, locations: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const serialized =
      typeof locations === "string"
        ? locations
        : locations
          ? JSON.stringify(locations)
          : "";

    if (!serialized) {
      return;
    }

    window.localStorage.setItem(getLocationsCacheKey(bookId), serialized);
  } catch {
    // Ignore cache write failures (quota/private mode) without affecting reading.
  }
}

function clearCachedLocations(bookId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getLocationsCacheKey(bookId));
  } catch {
    // Ignore cache cleanup failures.
  }
}

function getBookLocations(book: EpubBook | null): EpubLocations | null {
  if (!book) {
    return null;
  }

  const maybeLocations = (book as unknown as { locations?: Partial<EpubLocations> }).locations;

  if (
    !maybeLocations ||
    typeof maybeLocations.generate !== "function" ||
    typeof maybeLocations.percentageFromCfi !== "function"
  ) {
    return null;
  }

  return maybeLocations as EpubLocations;
}

function normalizeProgressPercentageValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const normalized = value <= 1 ? value * 100 : value;

  if (normalized > 100) {
    return null;
  }

  return Math.round(normalized * 100) / 100;
}

function isValidEpubPercentage(value: unknown) {
  return normalizeProgressPercentageValue(value) !== null;
}

function getDisplayedPagePercentage(displayed: { page?: unknown; total?: unknown } | undefined) {
  if (!displayed) {
    return null;
  }

  const { page, total } = displayed;

  if (
    typeof page !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(page) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  return normalizeProgressPercentageValue((page / total) * 100);
}

function getRelocatedFallbackProgress(payload: RelocatedPayload) {
  const candidates: Array<unknown> = [
    payload.end?.percentage,
    payload.start?.percentage,
    payload.percentage,
    getDisplayedPagePercentage(payload.end?.displayed),
    getDisplayedPagePercentage(payload.start?.displayed),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeProgressPercentageValue(candidate);

    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function getProgressFromCfi(
  book: EpubBook | null,
  cfi: string,
  locationsReady: boolean,
  fallbackProgressPercentage: number | null,
) {
  if (locationsReady) {
    const locations = getBookLocations(book);

    if (locations) {
      const percentageFromCfi = locations.percentageFromCfi(cfi);
      const normalizedProgressPercentage = normalizeProgressPercentageValue(percentageFromCfi);

      if (normalizedProgressPercentage !== null) {
        return {
          percentage: percentageFromCfi,
          progressPercentage: normalizedProgressPercentage,
        } as const;
      }

      return {
        percentage: percentageFromCfi,
        progressPercentage: fallbackProgressPercentage,
      } as const;
    }
  }

  return {
    percentage: null,
    progressPercentage: fallbackProgressPercentage,
  } as const;
}

function normalizeCfi(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function sanitizeCfiForDisplay(value: string) {
  const normalized = normalizeCfi(value);

  if (!normalized) {
    return null;
  }

  // Strip ID assertions that can become unstable across spine/chapter reflows.
  const sanitized = normalized.replace(/\[[^\]]*\]/g, "");
  return sanitized || null;
}

function getRelocatedStartCfi(payload: RelocatedPayload) {
  return normalizeCfi(payload.start?.cfi);
}

function getRelocatedEndCfi(payload: RelocatedPayload) {
  return normalizeCfi(payload.end?.cfi);
}

function normalizeChapterHref(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `index:${value}`;
  }

  return null;
}

function getRelocatedChapterHref(payload: RelocatedPayload) {
  const chapterHrefCandidates = [
    payload.start?.href,
    payload.start?.index,
    payload.end?.href,
    payload.end?.index,
  ];

  for (const candidate of chapterHrefCandidates) {
    const normalized = normalizeChapterHref(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getCfiSpineKey(cfi: string | null) {
  if (!cfi) {
    return null;
  }

  const matches = cfi.match(/^epubcfi\(([^!]*)!/i);
  return matches?.[1] ?? null;
}

function areCfisInDifferentSpines(startCfi: string | null, endCfi: string | null) {
  const startSpineKey = getCfiSpineKey(startCfi);
  const endSpineKey = getCfiSpineKey(endCfi);

  if (!startSpineKey || !endSpineKey) {
    return false;
  }

  return startSpineKey !== endSpineKey;
}

function getComparableCfi(cfi: string | null) {
  const normalized = normalizeCfi(cfi);

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\[[^\]]*\]/g, "");
}

function getCfiPositionVector(cfi: string | null) {
  const comparableCfi = getComparableCfi(cfi);

  if (!comparableCfi) {
    return null;
  }

  const contentPart = comparableCfi.includes("!")
    ? comparableCfi.slice(comparableCfi.indexOf("!") + 1)
    : comparableCfi;
  const numericParts = contentPart.match(/\d+/g);

  if (!numericParts || numericParts.length === 0) {
    return null;
  }

  return numericParts.map((value) => Number.parseInt(value, 10));
}

function compareCfiPosition(leftCfi: string | null, rightCfi: string | null) {
  const leftComparable = getComparableCfi(leftCfi);
  const rightComparable = getComparableCfi(rightCfi);

  if (!leftComparable || !rightComparable) {
    return null;
  }

  if (areCfisInDifferentSpines(leftComparable, rightComparable)) {
    return null;
  }

  const leftVector = getCfiPositionVector(leftComparable);
  const rightVector = getCfiPositionVector(rightComparable);

  if (!leftVector || !rightVector) {
    return null;
  }

  const maxLength = Math.max(leftVector.length, rightVector.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftVector[index] ?? 0;
    const rightPart = rightVector[index] ?? 0;

    if (leftPart < rightPart) {
      return -1;
    }

    if (leftPart > rightPart) {
      return 1;
    }
  }

  return 0;
}

function nudgeCfiForward(cfi: string | null, chars = 1) {
  const normalized = normalizeCfi(cfi);

  if (!normalized || !Number.isFinite(chars) || chars <= 0) {
    return null;
  }

  const nextCfi = normalized.replace(/:(\d+)(\)?)$/, (_, offset, closing) => {
    const parsedOffset = Number.parseInt(offset, 10);

    if (!Number.isFinite(parsedOffset)) {
      return `:${offset}${closing}`;
    }

    return `:${parsedOffset + chars}${closing}`;
  });

  return nextCfi !== normalized ? nextCfi : null;
}

function getStableStartCfi(payload: RelocatedPayload) {
  const startCfi = getRelocatedStartCfi(payload);
  const endCfi = getRelocatedEndCfi(payload);

  return startCfi ?? endCfi;
}

function getCurrentRenditionLocationPayload(rendition: Rendition | null) {
  if (!rendition) {
    return null;
  }

  const getCurrentLocation = (
    rendition as unknown as {
      currentLocation?: () => unknown;
    }
  ).currentLocation;

  if (typeof getCurrentLocation !== "function") {
    return null;
  }

  try {
    const location = getCurrentLocation() as RelocatedPayload | null;

    if (!location || typeof location !== "object") {
      return null;
    }

    return location;
  } catch {
    // Epub.js can throw while internals are being torn down; treat as no location.
    return null;
  }
}

function getCurrentRenditionCfi(rendition: Rendition | null) {
  const currentLocation = getCurrentRenditionLocationPayload(rendition);

  if (!currentLocation) {
    return null;
  }

  return getRelocatedStartCfi(currentLocation) ?? getRelocatedEndCfi(currentLocation);
}

function getRangeAnchor(range: Range, contents: EpubContents) {
  let rangeRect = range.getBoundingClientRect();

  if (rangeRect.width === 0 || rangeRect.height === 0) {
    const rangeRects = range.getClientRects();
    const firstRenderableRect = Array.from(rangeRects).find(
      (rect) => rect.width > 0 || rect.height > 0,
    );

    if (!firstRenderableRect) {
      return null;
    }

    rangeRect = firstRenderableRect;
  }

  const frameElement = contents.window.frameElement;

  if (!frameElement || !(frameElement instanceof Element)) {
    return null;
  }

  const frameRect = frameElement.getBoundingClientRect();
  const centerX = frameRect.left + rangeRect.left + rangeRect.width / 2;
  const top = frameRect.top + rangeRect.top;
  const bottom = frameRect.top + rangeRect.bottom;

  if (![centerX, top, bottom].every((value) => Number.isFinite(value))) {
    return null;
  }

  return { centerX, top, bottom } as SelectionAnchor;
}

function getSelectionAnchor(selection: Selection, contents: EpubContents) {
  if (selection.rangeCount === 0) {
    return null;
  }

  return getRangeAnchor(selection.getRangeAt(0), contents);
}

function getRenditionAnnotations(rendition: Rendition | null) {
  if (!rendition) {
    return null;
  }

  const annotations = (
    rendition as unknown as { annotations?: Partial<RenditionAnnotationsApi> }
  ).annotations;

  if (!annotations || typeof annotations.add !== "function") {
    return null;
  }

  return annotations as RenditionAnnotationsApi;
}

/**
 * Canonical chapter for a CFI. Derived from the spine so the same value is used
 * when storing a translation and when loading a chapter, even in two-page spreads
 * where the visible start and end belong to different chapters.
 */
function getChapterHrefForCfi(book: EpubBook | null, cfi: string | null) {
  const normalizedCfi = normalizeCfi(cfi);

  if (!book || !normalizedCfi) {
    return null;
  }

  try {
    const spine = (book as unknown as { spine?: EpubSpineApi }).spine;
    const section = spine?.get?.(normalizedCfi);

    return normalizeChapterHref(section?.href);
  } catch {
    return null;
  }
}

function getCfiRangeFromSelection(selection: Selection, contents: EpubContents) {
  if (selection.rangeCount === 0) {
    return null;
  }

  try {
    return normalizeCfi(contents.cfiFromRange(selection.getRangeAt(0)));
  } catch {
    return null;
  }
}

function getContentsRange(contents: EpubContents | null, cfiRange: string) {
  if (!contents) {
    return null;
  }

  try {
    return contents.range(cfiRange) ?? null;
  } catch {
    return null;
  }
}

/**
 * Highlights are SVG groups rendered outside the EPUB document, so a theme change
 * only needs to repaint them instead of re-registering every annotation.
 */
function repaintTranslationHighlights(container: HTMLElement | null, theme: ReaderTheme) {
  if (!container) {
    return;
  }

  const styles = TRANSLATION_HIGHLIGHT_STYLES[theme];
  const highlightGroups = container.querySelectorAll<SVGElement>(
    `.${TRANSLATION_HIGHLIGHT_CLASS_NAME}`,
  );

  highlightGroups.forEach((group) => {
    group.setAttribute("fill", styles.fill);
    group.setAttribute("fill-opacity", styles["fill-opacity"]);
    group.style.mixBlendMode = styles["mix-blend-mode"];
  });
}

function isReaderTheme(value: unknown): value is ReaderTheme {
  return value === "light" || value === "sepia" || value === "dark";
}

function normalizeReaderFontSize(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_READER_FONT_SIZE;
  }

  const bounded = Math.max(MIN_READER_FONT_SIZE, Math.min(MAX_READER_FONT_SIZE, value));
  const rounded = Math.round(bounded / READER_FONT_SIZE_STEP) * READER_FONT_SIZE_STEP;

  return Math.max(MIN_READER_FONT_SIZE, Math.min(MAX_READER_FONT_SIZE, rounded));
}

function readReaderPreferences() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const serialized = window.localStorage.getItem(READER_PREFERENCES_STORAGE_KEY);

    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized) as Partial<ReaderPreferences>;
    const theme = isReaderTheme(parsed.theme) ? parsed.theme : DEFAULT_READER_THEME;

    return {
      theme,
      fontSize: normalizeReaderFontSize(parsed.fontSize),
    } as ReaderPreferences;
  } catch {
    return null;
  }
}

function persistReaderPreferences(preferences: ReaderPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(READER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore preference write failures without interrupting reading.
  }
}

function scheduleMicrotask(task: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task);
    return;
  }

  Promise.resolve().then(task);
}

function getRenditionThemes(rendition: Rendition | null) {
  if (!rendition) {
    return null;
  }

  const themes = (rendition as unknown as { themes?: Partial<RenditionThemesApi> }).themes;

  if (
    !themes ||
    typeof themes.register !== "function" ||
    typeof themes.select !== "function" ||
    typeof themes.fontSize !== "function"
  ) {
    return null;
  }

  return themes as RenditionThemesApi;
}

function getRenditionEvents(rendition: Rendition) {
  return rendition as unknown as RenditionEventApi;
}

function getRenditionContentHooks(rendition: Rendition | null) {
  if (!rendition) {
    return null;
  }

  const contentHooks = (
    rendition as unknown as {
      hooks?: {
        content?: Partial<RenditionContentHooksApi>;
      };
    }
  ).hooks?.content;

  if (!contentHooks || typeof contentHooks.register !== "function") {
    return null;
  }

  return contentHooks as RenditionContentHooksApi;
}

function getRenditionContents(rendition: Rendition | null) {
  if (!rendition) {
    return [] as EpubContents[];
  }

  const getContents = (rendition as unknown as RenditionContentsApi).getContents;

  if (typeof getContents !== "function") {
    return [] as EpubContents[];
  }

  try {
    const contents = getContents();

    if (Array.isArray(contents)) {
      return contents as EpubContents[];
    }

    if (contents && typeof contents === "object") {
      return [contents as EpubContents];
    }

    return [];
  } catch {
    return [];
  }
}

function getRenditionManager(rendition: Rendition | null) {
  if (!rendition) {
    return null;
  }

  const manager = (rendition as unknown as RenditionManagerRefApi).manager;

  if (!manager || typeof manager !== "object") {
    return null;
  }

  return manager;
}

function buildSelectionCss(theme: ReaderTheme) {
  const palette = READER_THEME_PALETTE[theme];
  const selectionTextColor = theme === "dark" ? DARK_THEME_SELECTION_TEXT : palette.epubText;

  return [
    "::selection {",
    `  background: ${EPUB_SELECTION_BACKGROUND};`,
    `  color: ${selectionTextColor};`,
    "}",
    "::-moz-selection {",
    `  background: ${EPUB_SELECTION_BACKGROUND};`,
    `  color: ${selectionTextColor};`,
    "}",
  ].join("\n");
}

function applySelectionStylesToContents(contents: EpubContents, theme: ReaderTheme) {
  const selectionDocument = contents.window.document;
  const selectionRoot = selectionDocument.head ?? selectionDocument.documentElement;

  if (!selectionRoot) {
    return;
  }

  let styleElement = selectionDocument.getElementById(EPUB_SELECTION_STYLE_ELEMENT_ID);

  if (!styleElement) {
    styleElement = selectionDocument.createElement("style");
    styleElement.id = EPUB_SELECTION_STYLE_ELEMENT_ID;
    selectionRoot.appendChild(styleElement);
  }

  styleElement.textContent = buildSelectionCss(theme);
}

function applySelectionStylesToRendition(rendition: Rendition | null, theme: ReaderTheme) {
  for (const contents of getRenditionContents(rendition)) {
    applySelectionStylesToContents(contents, theme);
  }
}

function getThemeRules(theme: ReaderTheme) {
  const palette = READER_THEME_PALETTE[theme];
  const themeClass = EPUB_THEME_NAMES[theme];
  const rules: Record<string, Record<string, string>> = {};

  rules["body." + themeClass + ", ." + themeClass + " body, ." + themeClass] = {
      "background-color": palette.epubBackground,
      color: palette.epubText,
      "font-family": "Georgia, serif",
      "line-height": "1.65",
      margin: "0 auto",
      padding: "0 1rem",
      "max-width": "44rem",
      "text-rendering": "optimizeLegibility",
    };

  rules["body." + themeClass + " p, ." + themeClass + " p"] = {
      "line-height": "1.65",
      margin: "0.65em 0",
    };

  rules[
    "body." + themeClass + " blockquote, body." + themeClass + " li, ." + themeClass + " blockquote, ." + themeClass + " li"
  ] = {
      "line-height": "1.65",
    };

  rules[
    "body." + themeClass + " h1, body." + themeClass + " h2, body." + themeClass + " h3, body." + themeClass + " h4, body." + themeClass + " h5, body." + themeClass + " h6, ." + themeClass + " h1, ." + themeClass + " h2, ." + themeClass + " h3, ." + themeClass + " h4, ." + themeClass + " h5, ." + themeClass + " h6"
  ] = {
      color: palette.epubText,
      "line-height": "1.3",
    };

  rules[
    "body." + themeClass + " a, body." + themeClass + " a:link, body." + themeClass + " a:visited, ." + themeClass + " a, ." + themeClass + " a:link, ." + themeClass + " a:visited"
  ] = {
      color: palette.epubText,
    };

  return rules;
}

function registerReaderThemes(rendition: Rendition) {
  const themes = getRenditionThemes(rendition);

  if (!themes) {
    return;
  }

  themes.register(EPUB_THEME_NAMES.light, getThemeRules("light"));
  themes.register(EPUB_THEME_NAMES.sepia, getThemeRules("sepia"));
  themes.register(EPUB_THEME_NAMES.dark, getThemeRules("dark"));
}

function applyReaderAppearance(rendition: Rendition | null, theme: ReaderTheme, fontSize: number) {
  const themes = getRenditionThemes(rendition);

  if (!themes) {
    return;
  }

  themes.select(EPUB_THEME_NAMES[theme]);
  themes.fontSize(`${fontSize}%`);
}

function applySpreadForViewport(rendition: Rendition | null, isMobileViewport: boolean) {
  if (!rendition) {
    return;
  }

  const spread = (rendition as RenditionSpreadApi).spread;

  if (typeof spread !== "function") {
    return;
  }

  try {
    spread(isMobileViewport ? "none" : "always");
  } catch {
    // TODO: if a specific EPUB breaks with spread=always, keep single-page mode until per-book handling exists.
    try {
      spread("none");
    } catch {
      // Ignore spread failures and keep reader usable.
    }
  }
}

function getContainerDimensions(container: HTMLDivElement | null) {
  if (!container) {
    return null;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function getTouchByIdentifier(touches: TouchList, identifier: number | null) {
  if (identifier === null) {
    return touches.item(0);
  }

  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);

    if (touch && touch.identifier === identifier) {
      return touch;
    }
  }

  return null;
}

function hasSelectedText(selection: Selection | null | undefined) {
  if (!selection) {
    return false;
  }

  return Boolean(selection.toString().trim());
}

export function EpubReader({
  bookId,
  bookTitle,
  bookAuthor,
  sourceLanguage,
  targetLanguage,
  initialLocation,
  initialProgressPercentage,
}: EpubReaderProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const selectedContentsRef = useRef<EpubContents | null>(null);
  const stableReadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNavigationReasonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerSettingsGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDesktopClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringInitialLocationRef = useRef(false);
  const isApplyingReaderSettingsRef = useRef(false);
  const pendingNavigationReasonRef = useRef<ReadingProgressSaveReason | null>(null);
  const latestRestoreLocationRef = useRef<string | null>(null);
  const latestProgressPercentageRef = useRef<number | null>(null);
  const latestChapterHrefRef = useRef<string | null>(null);
  const lastSavedLocationRef = useRef<string | null>(null);
  const lastSavedProgressRef = useRef<number | null>(null);
  const hasUserNavigatedRef = useRef(false);
  const locationsReadyRef = useRef(false);
  const isRenditionReadyRef = useRef(false);
  const hasHydratedPreferencesRef = useRef(false);
  const selectedTextRef = useRef("");
  const isSettingsOpenRef = useRef(false);
  const isTouchLikeDeviceRef = useRef(false);
  const themeRef = useRef<ReaderTheme>(DEFAULT_READER_THEME);
  const fontSizeRef = useRef(DEFAULT_READER_FONT_SIZE);
  const isMobileViewportRef = useRef(true);
  const selectionLockedScrollLeftRef = useRef<number | null>(null);
  const selectionLockedScrollTopRef = useRef<number | null>(null);
  const isSyncingSelectionScrollRef = useRef(false);
  const targetLanguageRef = useRef(targetLanguage);
  const translationsByCfiRef = useRef(new Map<string, BookTranslation>());
  const savedVocabularyTranslationIdsRef = useRef(new Set<string>());
  const appliedHighlightCfisRef = useRef(new Set<string>());
  const loadedChapterHrefsRef = useRef(new Set<string>());
  const loadingChapterHrefsRef = useRef(new Set<string>());
  const panelSourceRef = useRef<"selection" | "highlight" | null>(null);
  const selectionCfiRangeRef = useRef<string | null>(null);
  const pendingMobileUiToggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Invalidates in-flight chapter loads when the reader runtime is torn down.
  const readerRuntimeIdRef = useRef(0);
  // Incremental id of the current load attempt: a response from an older attempt
  // must never overwrite the state of the newest one.
  const loadAttemptIdRef = useRef(0);
  // Runtime vivo de epub.js. Permite que un doble montaje de React reutilice la
  // instancia en curso en lugar de descargar y construir el libro otra vez.
  const activeReaderRuntimeRef = useRef<ReaderRuntimeHandle | null>(null);
  const performanceTrackerRef = useRef<ReaderPerformanceTracker | null>(null);
  const hasMarkedTranslationsReadyRef = useRef(false);

  const [loadPhase, setLoadPhase] = useState<ReaderLoadPhase>("idle");
  const [reloadToken, setReloadToken] = useState(0);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [contextSentence, setContextSentence] = useState<string | null>(null);
  const [selectionCfiRange, setSelectionCfiRange] = useState<string | null>(null);
  const [selectionChapterHref, setSelectionChapterHref] = useState<string | null>(null);
  const [activeTranslation, setActiveTranslation] = useState<BookTranslation | null>(null);
  const [isActiveTranslationSaved, setIsActiveTranslationSaved] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState<number | null>(null);
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>(DEFAULT_READER_THEME);
  const [fontSize, setFontSize] = useState(DEFAULT_READER_FONT_SIZE);
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.innerWidth < DESKTOP_SPREAD_BREAKPOINT;
  });
  const [viewportSize, setViewportSize] = useState(() => {
    if (typeof window === "undefined") {
      return { width: 0, height: 0 };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  const themePalette = useMemo(() => READER_THEME_PALETTE[theme], [theme]);
  const isReaderUiVisible = isChromeVisible || isSettingsOpen;
  const isReady = loadPhase === "ready";
  // A retry keeps the loading screen: the final error is only shown once every attempt failed.
  const isLoading = loadPhase !== "ready" && loadPhase !== "error";

  const clearStableReadingDebounce = useCallback(() => {
    if (stableReadingTimerRef.current) {
      clearTimeout(stableReadingTimerRef.current);
      stableReadingTimerRef.current = null;
    }
  }, []);

  const clearPendingNavigationReason = useCallback(() => {
    pendingNavigationReasonRef.current = null;

    if (pendingNavigationReasonTimerRef.current) {
      clearTimeout(pendingNavigationReasonTimerRef.current);
      pendingNavigationReasonTimerRef.current = null;
    }
  }, []);

  const setPendingNavigationReason = useCallback((reason: "next" | "prev") => {
    pendingNavigationReasonRef.current = reason;

    if (pendingNavigationReasonTimerRef.current) {
      clearTimeout(pendingNavigationReasonTimerRef.current);
    }

    pendingNavigationReasonTimerRef.current = setTimeout(() => {
      pendingNavigationReasonRef.current = null;
      pendingNavigationReasonTimerRef.current = null;
    }, PENDING_NAVIGATION_REASON_TIMEOUT_MS);
  }, []);

  const clearRestoreGuardTimer = useCallback(() => {
    if (restoreGuardTimerRef.current) {
      clearTimeout(restoreGuardTimerRef.current);
      restoreGuardTimerRef.current = null;
    }
  }, []);

  const scheduleRestoreGuardRelease = useCallback(() => {
    clearRestoreGuardTimer();
    restoreGuardTimerRef.current = setTimeout(() => {
      isRestoringInitialLocationRef.current = false;
      restoreGuardTimerRef.current = null;
    }, INITIAL_RESTORE_SETTLE_MS);
  }, [clearRestoreGuardTimer]);

  const clearReaderSettingsGuardTimer = useCallback(() => {
    if (readerSettingsGuardTimerRef.current) {
      clearTimeout(readerSettingsGuardTimerRef.current);
      readerSettingsGuardTimerRef.current = null;
    }
  }, []);

  const scheduleReaderSettingsGuardRelease = useCallback(() => {
    clearReaderSettingsGuardTimer();
    readerSettingsGuardTimerRef.current = setTimeout(() => {
      isApplyingReaderSettingsRef.current = false;
      readerSettingsGuardTimerRef.current = null;
    }, READER_SETTINGS_SETTLE_MS);
  }, [clearReaderSettingsGuardTimer]);

  const hasActiveTextSelection = useCallback(() => {
    // A panel opened from a highlight has no native selection, so it must not
    // block swipe navigation the way a real selection does.
    if (panelSourceRef.current !== "highlight" && selectedTextRef.current.trim().length > 0) {
      return true;
    }

    const browserSelection = typeof window === "undefined" ? null : window.getSelection();

    if (hasSelectedText(browserSelection)) {
      return true;
    }

    if (hasSelectedText(selectedContentsRef.current?.window.getSelection())) {
      return true;
    }

    const renditionContents = getRenditionContents(renditionRef.current);

    for (const contents of renditionContents) {
      if (hasSelectedText(contents.window.getSelection())) {
        return true;
      }
    }

    return false;
  }, []);

  const releaseSelectionScrollLock = useCallback(() => {
    selectionLockedScrollLeftRef.current = null;
    selectionLockedScrollTopRef.current = null;
    isSyncingSelectionScrollRef.current = false;
  }, []);

  const syncSelectionScrollLock = useCallback(() => {
    const renditionManager = getRenditionManager(renditionRef.current);
    const scrollContainer = renditionManager?.container ?? null;

    if (!scrollContainer) {
      releaseSelectionScrollLock();
      return;
    }

    if (!hasActiveTextSelection()) {
      releaseSelectionScrollLock();
      return;
    }

    if (
      selectionLockedScrollLeftRef.current === null ||
      selectionLockedScrollTopRef.current === null
    ) {
      selectionLockedScrollLeftRef.current = scrollContainer.scrollLeft;
      selectionLockedScrollTopRef.current = scrollContainer.scrollTop;
      return;
    }

    const targetLeft = selectionLockedScrollLeftRef.current;
    const targetTop = selectionLockedScrollTopRef.current;
    const hasHorizontalDrift = Math.abs(scrollContainer.scrollLeft - targetLeft) >= 1;
    const hasVerticalDrift = Math.abs(scrollContainer.scrollTop - targetTop) >= 1;

    if (!hasHorizontalDrift && !hasVerticalDrift) {
      return;
    }

    isSyncingSelectionScrollRef.current = true;

    try {
      if (typeof renditionManager?.scrollTo === "function") {
        renditionManager.scrollTo(targetLeft, targetTop, true);
      } else {
        scrollContainer.scrollLeft = targetLeft;
        scrollContainer.scrollTop = targetTop;
      }
    } finally {
      isSyncingSelectionScrollRef.current = false;
    }
  }, [hasActiveTextSelection, releaseSelectionScrollLock]);

  useEffect(() => {
    selectedTextRef.current = selectedText;
  }, [selectedText]);

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    isMobileViewportRef.current = isMobileViewport;
  }, [isMobileViewport]);

  useEffect(() => {
    targetLanguageRef.current = targetLanguage;
  }, [targetLanguage]);

  useEffect(() => {
    selectionCfiRangeRef.current = selectionCfiRange;
  }, [selectionCfiRange]);

  useEffect(() => {
    if (selectedText) {
      syncSelectionScrollLock();
      return;
    }

    releaseSelectionScrollLock();
  }, [releaseSelectionScrollLock, selectedText, syncSelectionScrollLock]);

  useEffect(() => {
    let isCancelled = false;
    const savedPreferences = readReaderPreferences();

    scheduleMicrotask(() => {
      if (isCancelled) {
        return;
      }

      if (savedPreferences) {
        setTheme(savedPreferences.theme);
        setFontSize(savedPreferences.fontSize);
      }

      hasHydratedPreferencesRef.current = true;
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedPreferencesRef.current) {
      return;
    }

    persistReaderPreferences({ theme, fontSize });
  }, [theme, fontSize]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasCoarsePointer = typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    const hasTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const hasTouchEvent = "ontouchstart" in window;

    isTouchLikeDeviceRef.current = hasCoarsePointer || hasTouchPoints || hasTouchEvent;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateViewportMode = () => {
      setIsMobileViewport(window.innerWidth < DESKTOP_SPREAD_BREAKPOINT);
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => {
      window.removeEventListener("resize", updateViewportMode);
    };
  }, []);

  useEffect(() => {
    const rendition = renditionRef.current;

    if (!rendition) {
      return;
    }

    isApplyingReaderSettingsRef.current = true;
    clearStableReadingDebounce();
    applyReaderAppearance(rendition, theme, fontSize);
    applySelectionStylesToRendition(rendition, theme);
    repaintTranslationHighlights(containerRef.current, theme);
    scheduleReaderSettingsGuardRelease();
  }, [clearStableReadingDebounce, scheduleReaderSettingsGuardRelease, theme, fontSize]);

  useEffect(() => {
    const rendition = renditionRef.current;

    if (!rendition) {
      return;
    }

    isApplyingReaderSettingsRef.current = true;
    clearStableReadingDebounce();
    applySpreadForViewport(rendition, isMobileViewport);
    scheduleReaderSettingsGuardRelease();

    const dimensions = getContainerDimensions(containerRef.current);

    if (!dimensions) {
      return;
    }

    try {
      rendition.resize(dimensions.width, dimensions.height);
    } catch {
      // Ignore transient resize race conditions while epub.js is settling.
    }
  }, [clearStableReadingDebounce, isMobileViewport, scheduleReaderSettingsGuardRelease]);

  const clearSelection = useCallback(() => {
    const nativeSelection = selectedContentsRef.current?.window.getSelection();
    nativeSelection?.removeAllRanges();
    panelSourceRef.current = null;
    setSelectedText("");
    setContextSentence(null);
    setSelectionAnchor(null);
    setSelectionCfiRange(null);
    setSelectionChapterHref(null);
    setActiveTranslation(null);
    setIsActiveTranslationSaved(false);
    releaseSelectionScrollLock();
  }, [releaseSelectionScrollLock]);

  const clearPendingDesktopClickToggle = useCallback(() => {
    if (pendingDesktopClickTimerRef.current) {
      clearTimeout(pendingDesktopClickTimerRef.current);
      pendingDesktopClickTimerRef.current = null;
    }
  }, []);

  const clearPendingMobileUiToggle = useCallback(() => {
    if (pendingMobileUiToggleTimerRef.current) {
      clearTimeout(pendingMobileUiToggleTimerRef.current);
      pendingMobileUiToggleTimerRef.current = null;
    }
  }, []);

  const getTranslationCacheKey = useCallback(
    (cfiRange: string) => buildTranslationCacheKey(cfiRange, targetLanguageRef.current),
    [],
  );

  const cacheTranslation = useCallback(
    (translation: BookTranslation) => {
      translationsByCfiRef.current.set(getTranslationCacheKey(translation.cfiRange), translation);
    },
    [getTranslationCacheKey],
  );

  const getCachedTranslation = useCallback(
    (cfiRange: string | null) => {
      if (!cfiRange) {
        return null;
      }

      return translationsByCfiRef.current.get(getTranslationCacheKey(cfiRange)) ?? null;
    },
    [getTranslationCacheKey],
  );

  const applyTranslationHighlight = useCallback((cfiRange: string) => {
    const annotations = getRenditionAnnotations(renditionRef.current);

    if (!annotations || appliedHighlightCfisRef.current.has(cfiRange)) {
      return;
    }

    try {
      annotations.add(
        TRANSLATION_HIGHLIGHT_TYPE,
        cfiRange,
        {},
        undefined,
        TRANSLATION_HIGHLIGHT_CLASS_NAME,
        TRANSLATION_HIGHLIGHT_STYLES[themeRef.current],
      );

      appliedHighlightCfisRef.current.add(cfiRange);
      logBookTranslationEvent("HIGHLIGHT_APPLIED");
    } catch {
      // A CFI that no longer resolves must never break reading. Drop the annotation
      // so epub.js does not retry it on every re-render of the chapter.
      try {
        annotations.remove(cfiRange, TRANSLATION_HIGHLIGHT_TYPE);
      } catch {
        // Nothing else to clean up.
      }
    }
  }, []);

  const loadChapterTranslations = useCallback(
    async (chapterHref: string) => {
      if (
        loadedChapterHrefsRef.current.has(chapterHref) ||
        loadingChapterHrefsRef.current.has(chapterHref)
      ) {
        return;
      }

      const runtimeId = readerRuntimeIdRef.current;
      loadingChapterHrefsRef.current.add(chapterHref);

      try {
        const result = await fetchChapterBookTranslations({ bookId, chapterHref });

        if (!result || runtimeId !== readerRuntimeIdRef.current) {
          return;
        }

        loadedChapterHrefsRef.current.add(chapterHref);

        if (!hasMarkedTranslationsReadyRef.current) {
          hasMarkedTranslationsReadyRef.current = true;
          performanceTrackerRef.current?.mark("TRANSLATIONS_READY", {
            translations: result.translations.length,
          });
        }

        for (const savedTranslationId of result.savedVocabularyTranslationIds) {
          savedVocabularyTranslationIdsRef.current.add(savedTranslationId);
        }

        for (const translation of result.translations) {
          cacheTranslation(translation);
          applyTranslationHighlight(translation.cfiRange);
        }
      } finally {
        loadingChapterHrefsRef.current.delete(chapterHref);
      }
    },
    [applyTranslationHighlight, bookId, cacheTranslation],
  );

  const openPanelForTranslation = useCallback(
    (translation: BookTranslation, contents: EpubContents | null) => {
      const range = getContentsRange(contents, translation.cfiRange);

      panelSourceRef.current = "highlight";
      selectedContentsRef.current = contents;
      setSelectionAnchor(range && contents ? getRangeAnchor(range, contents) : null);
      setSelectedText(translation.selectedText);
      setContextSentence(translation.contextSentence);
      setSelectionCfiRange(translation.cfiRange);
      setSelectionChapterHref(translation.chapterHref);
      setActiveTranslation(translation);
      setIsActiveTranslationSaved(
        isPersistedTranslationId(translation.id) &&
          savedVocabularyTranslationIdsRef.current.has(translation.id),
      );
    },
    [],
  );

  const handleStoredTranslationFound = useCallback(
    (translation: BookTranslation) => {
      cacheTranslation(translation);
      applyTranslationHighlight(translation.cfiRange);

      // The lookup is async: ignore it if the reader already moved to another range.
      if (selectionCfiRangeRef.current !== translation.cfiRange) {
        return;
      }

      setActiveTranslation(translation);
      setIsActiveTranslationSaved(
        isPersistedTranslationId(translation.id) &&
          savedVocabularyTranslationIdsRef.current.has(translation.id),
      );
    },
    [applyTranslationHighlight, cacheTranslation],
  );

  const handleTranslationReady = useCallback(
    (cfiRange: string) => {
      applyTranslationHighlight(cfiRange);
    },
    [applyTranslationHighlight],
  );

  const persistTranslation = useCallback(
    async (input: CreateBookTranslationRequest) => {
      const result = await persistBookTranslation(input);

      if (!result) {
        logBookTranslationEvent("SAVE_FAILED", { cfiLength: input.cfiRange.length });

        // The AI answer is valid, so it stays visible and highlighted for this session.
        // It is not persisted, so it will not come back after reopening the book.
        cacheTranslation(buildLocalBookTranslation(input));
        return null;
      }

      logBookTranslationEvent("SAVED", { status: result.status });
      cacheTranslation(result.translation);
      applyTranslationHighlight(result.translation.cfiRange);

      return result.translation;
    },
    [applyTranslationHighlight, cacheTranslation],
  );

  const markTranslationSaved = useCallback((bookTranslationId: string) => {
    savedVocabularyTranslationIdsRef.current.add(bookTranslationId);
    setIsActiveTranslationSaved(true);
  }, []);

  const toggleReaderUi = useCallback(() => {
    setIsChromeVisible((isVisible) => {
      const nextVisibility = !isVisible;

      if (!nextVisibility) {
        setIsSettingsOpen(false);
      }

      return nextVisibility;
    });
  }, []);

  const openSettings = useCallback(() => {
    setIsChromeVisible(true);
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const increaseFontSize = useCallback(() => {
    setFontSize((current) =>
      Math.min(MAX_READER_FONT_SIZE, current + READER_FONT_SIZE_STEP),
    );
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize((current) =>
      Math.max(MIN_READER_FONT_SIZE, current - READER_FONT_SIZE_STEP),
    );
  }, []);

  const navigateBackToLibrary = useCallback(() => {
    router.push(ROUTES.library);
  }, [router]);

  const retryReaderLoad = useCallback(() => {
    setReaderError(null);
    clearSelection();
    // Re-runs the load effect, which always starts from a brand new signed URL.
    setReloadToken((token) => token + 1);
  }, [clearSelection]);

  const clearPanelFromOutsideInteraction = useCallback(() => {
    clearPendingDesktopClickToggle();
    clearSelection();
  }, [clearPendingDesktopClickToggle, clearSelection]);

  const panelLayout = useMemo(() => {
    const visibleTopOffset = isReaderUiVisible ? 86 : PANEL_VIEWPORT_MARGIN;

    if (isMobileViewport) {
      const width = Math.max(260, viewportSize.width - 32);
      const maxPanelHeight = Math.max(220, Math.round((viewportSize.height * MOBILE_PANEL_MAX_HEIGHT_VH) / 100));

      if (!selectionAnchor || viewportSize.width <= 0 || viewportSize.height <= 0) {
        return {
          wrapperClassName: "fixed z-70 md:hidden",
          style: {
            left: 16,
            width: "calc(100vw - 32px)",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: `${maxPanelHeight}px`,
            bottom: isReaderUiVisible
              ? "calc(env(safe-area-inset-bottom) + 5.75rem)"
              : "calc(env(safe-area-inset-bottom) + 0.75rem)",
          } as const,
          variant: "mobile" as const,
        };
      }

      const estimatedHeight = Math.min(maxPanelHeight, 320);
      const preferredTop = selectionAnchor.top - estimatedHeight - PANEL_SELECTION_GAP;
      const belowTop = selectionAnchor.bottom + PANEL_SELECTION_GAP;
      const fitsAbove = preferredTop >= visibleTopOffset;
      const maxTop = Math.max(visibleTopOffset, viewportSize.height - estimatedHeight - PANEL_VIEWPORT_MARGIN);
      const top = Math.min(Math.max(fitsAbove ? preferredTop : belowTop, visibleTopOffset), maxTop);
      const left = Math.min(
        Math.max(selectionAnchor.centerX - width / 2, PANEL_VIEWPORT_MARGIN),
        viewportSize.width - width - PANEL_VIEWPORT_MARGIN,
      );

      return {
        wrapperClassName: "fixed z-70 md:hidden",
        style: {
          left,
          top,
          width: "calc(100vw - 32px)",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: `${maxPanelHeight}px`,
        } as const,
        variant: "mobile" as const,
      };
    }

    const width = Math.min(DESKTOP_PANEL_MAX_WIDTH, Math.max(320, viewportSize.width - PANEL_VIEWPORT_MARGIN * 2));
    const estimatedHeight = 360;

    if (!selectionAnchor || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return {
        wrapperClassName: "fixed z-60 hidden md:block",
        style: {
          left: "50%",
          transform: "translateX(-50%)",
          width,
          bottom: isReaderUiVisible
            ? "calc(env(safe-area-inset-bottom) + 6rem)"
            : "calc(env(safe-area-inset-bottom) + 1rem)",
        } as const,
        variant: "desktop" as const,
      };
    }

    const preferredTop = selectionAnchor.top - estimatedHeight - PANEL_SELECTION_GAP;
    const belowTop = selectionAnchor.bottom + PANEL_SELECTION_GAP;
    const fitsAbove = preferredTop >= visibleTopOffset;
    const maxTop = Math.max(visibleTopOffset, viewportSize.height - estimatedHeight - PANEL_VIEWPORT_MARGIN);
    const top = Math.min(Math.max(fitsAbove ? preferredTop : belowTop, visibleTopOffset), maxTop);
    const left = Math.min(
      Math.max(selectionAnchor.centerX - width / 2, PANEL_VIEWPORT_MARGIN),
      viewportSize.width - width - PANEL_VIEWPORT_MARGIN,
    );

    return {
      wrapperClassName: "fixed z-60 hidden md:block",
      style: {
        left,
        top,
        width,
      } as const,
      variant: "desktop" as const,
    };
  }, [isMobileViewport, isReaderUiVisible, selectionAnchor, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!selectedText) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target;

      if (!(targetNode instanceof Node)) {
        return;
      }

      const panelNode = panelContainerRef.current;

      if (panelNode && panelNode.contains(targetNode)) {
        return;
      }

      const readerContainer = containerRef.current;

      if (!readerContainer || !readerContainer.contains(targetNode)) {
        return;
      }

      clearPanelFromOutsideInteraction();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [clearPanelFromOutsideInteraction, selectedText]);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();
    let resizeObserver: ResizeObserver | null = null;
    let resizeRendition: (() => void) | null = null;
    let selectionHandler: RenditionEventHandler | null = null;
    let relocatedHandler: RenditionEventHandler | null = null;
    let clickHandler: RenditionEventHandler | null = null;
    let markClickedHandler: RenditionEventHandler | null = null;
    let lastMarkClickedAt = 0;
    let isDesktopSelectionPointerDown = false;
    let pendingDesktopSelectionContents: EpubContents | null = null;
    let pendingDesktopSelectionCfiRange: string | null = null;
    let loadTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let afterPaintFrame: number | null = null;
    let afterPaintTimer: ReturnType<typeof setTimeout> | null = null;
    const selectionReleaseCleanupCallbacks: Array<() => void> = [];
    const selectionTrackedDocuments = new WeakSet<Document>();
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const renderContainer: HTMLDivElement = container;
    const runtimeKey = `${bookId}:${reloadToken}`;
    const liveRuntime = activeReaderRuntimeRef.current;

    // Doble ejecucion del efecto sobre el mismo libro y el mismo nodo (Strict Mode):
    // se conserva el runtime en curso en lugar de pedir otra signed URL y reconstruir.
    if (liveRuntime && liveRuntime.key === runtimeKey && liveRuntime.container === renderContainer) {
      liveRuntime.keepAlive();

      return () => {
        liveRuntime.scheduleTeardown();
      };
    }

    loadAttemptIdRef.current += 1;
    const loadAttemptId = loadAttemptIdRef.current;
    const performanceTracker = createReaderPerformanceTracker(bookId);
    performanceTrackerRef.current = performanceTracker;
    hasMarkedTranslationsReadyRef.current = false;
    performanceTracker.mark("LOAD_STARTED");

    /**
     * True when this load was cancelled or superseded by a newer one. Guards every
     * async continuation so a late response cannot resurrect an old error or reader.
     */
    const isStaleLoadAttempt = () =>
      isCancelled || loadAttemptId !== loadAttemptIdRef.current;

    const clearPendingSelectionRelease = () => {
      pendingDesktopSelectionContents = null;
      pendingDesktopSelectionCfiRange = null;
      isDesktopSelectionPointerDown = false;

      for (const cleanup of selectionReleaseCleanupCallbacks) {
        cleanup();
      }

      selectionReleaseCleanupCallbacks.length = 0;
    };

    const clearLoadTimeout = () => {
      if (!loadTimeoutTimer) {
        return;
      }

      clearTimeout(loadTimeoutTimer);
      loadTimeoutTimer = null;
    };

    const startLoadTimeout = () => {
      clearLoadTimeout();
      loadTimeoutTimer = setTimeout(() => {
        failReaderLoad("EPUB_LOAD_TIMEOUT");
      }, READER_LOAD_TIMEOUT_MS);
    };

    const clearAfterPaintWork = () => {
      if (afterPaintFrame !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(afterPaintFrame);
      }

      afterPaintFrame = null;

      if (afterPaintTimer) {
        clearTimeout(afterPaintTimer);
        afterPaintTimer = null;
      }
    };

    /** Trabajo secundario: arranca cuando la primera pagina ya se ha pintado. */
    const runAfterFirstPaint = (task: () => void) => {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        afterPaintTimer = setTimeout(task, 0);
        return;
      }

      afterPaintFrame = window.requestAnimationFrame(() => {
        afterPaintFrame = null;
        afterPaintTimer = setTimeout(() => {
          afterPaintTimer = null;
          task();
        }, 0);
      });
    };

    const teardownReaderRuntime = () => {
      clearAfterPaintWork();
      clearStableReadingDebounce();
      clearPendingNavigationReason();
      clearRestoreGuardTimer();
      clearReaderSettingsGuardTimer();
      isRestoringInitialLocationRef.current = false;
      isApplyingReaderSettingsRef.current = false;
      releaseSelectionScrollLock();
      abortController.abort();
      isRenditionReadyRef.current = false;
      locationsReadyRef.current = false;

      if (resizeRendition) {
        window.removeEventListener("resize", resizeRendition);
      }

      resizeObserver?.disconnect();
      clearPendingDesktopClickToggle();
      clearPendingMobileUiToggle();
      clearPendingSelectionRelease();

      if (selectionHandler && renditionRef.current) {
        getRenditionEvents(renditionRef.current).off("selected", selectionHandler);
      }

      if (markClickedHandler && renditionRef.current) {
        getRenditionEvents(renditionRef.current).off("markClicked", markClickedHandler);
      }

      if (relocatedHandler && renditionRef.current) {
        getRenditionEvents(renditionRef.current).off("relocated", relocatedHandler);
      }

      if (clickHandler && renditionRef.current) {
        getRenditionEvents(renditionRef.current).off("click", clickHandler);
      }

      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      renderContainer.innerHTML = "";
    };

    const failReaderLoad = (code: BookAccessErrorCode) => {
      if (isStaleLoadAttempt()) {
        return;
      }

      isCancelled = true;
      clearLoadTimeout();
      teardownReaderRuntime();
      latestRestoreLocationRef.current = null;
      latestProgressPercentageRef.current = null;
      latestChapterHrefRef.current = null;
      setSelectedText("");
      setContextSentence(null);
      setSelectionAnchor(null);
      setSelectionCfiRange(null);
      setSelectionChapterHref(null);
      setActiveTranslation(null);
      setIsActiveTranslationSaved(false);
      setProgressPercentage(null);
      setIsSettingsOpen(false);
      setIsChromeVisible(false);
      setLoadPhase("error");
      setReaderError(getBookAccessErrorMessage(code));
    };

    const commitSelectionFromContents = (
      contents: EpubContents,
      fallbackCfiRange: string | null = null,
    ) => {
      const selection = contents.window.getSelection();

      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const extractedContext = extractContextSentenceFromSelection(selection);

      if (!extractedContext.selectedText) {
        return;
      }

      // Computed from the live range so it always covers the whole final selection,
      // not just the range epub.js reported while the pointer was still down.
      const cfiRange = getCfiRangeFromSelection(selection, contents) ?? fallbackCfiRange;
      const storedTranslation = getCachedTranslation(cfiRange);

      clearPendingDesktopClickToggle();
      clearPendingMobileUiToggle();
      panelSourceRef.current = "selection";
      selectedContentsRef.current = contents;
      setSelectionAnchor(getSelectionAnchor(selection, contents));
      setSelectedText(extractedContext.selectedText);
      setContextSentence(extractedContext.contextSentence);
      setSelectionCfiRange(cfiRange);
      setSelectionChapterHref(
        getChapterHrefForCfi(bookRef.current, cfiRange) ?? latestChapterHrefRef.current,
      );
      setActiveTranslation(storedTranslation);
      setIsActiveTranslationSaved(
        Boolean(
          storedTranslation &&
            isPersistedTranslationId(storedTranslation.id) &&
            savedVocabularyTranslationIdsRef.current.has(storedTranslation.id),
        ),
      );

      if (storedTranslation) {
        logBookTranslationEvent("FOUND");
      }
    };

    const flushPendingDesktopSelection = () => {
      const pendingContents = pendingDesktopSelectionContents;
      const pendingCfiRange = pendingDesktopSelectionCfiRange;

      if (!pendingContents) {
        return;
      }

      pendingDesktopSelectionContents = null;
      pendingDesktopSelectionCfiRange = null;
      commitSelectionFromContents(pendingContents, pendingCfiRange);
    };

    const registerSelectionReleaseTracking = (contents: EpubContents) => {
      const releaseDocument = contents.window.document;

      if (selectionTrackedDocuments.has(releaseDocument)) {
        return;
      }

      selectionTrackedDocuments.add(releaseDocument);

      const onPressStart = () => {
        if (isMobileViewportRef.current || isTouchLikeDeviceRef.current) {
          return;
        }

        isDesktopSelectionPointerDown = true;
      };

      const onRelease = () => {
        if (!isDesktopSelectionPointerDown) {
          return;
        }

        isDesktopSelectionPointerDown = false;
        flushPendingDesktopSelection();
      };

      const onPointerDown = (event: PointerEvent) => {
        if ((event.buttons & 1) !== 1) {
          return;
        }

        onPressStart();
      };

      const syncPanelWithNativeSelection = () => {
        if (!selectedTextRef.current) {
          return;
        }

        // This only mirrors native selections. A panel opened from a highlight has no
        // selection to lose, so a selectionchange caused by the tap must not close it.
        if (panelSourceRef.current === "highlight") {
          return;
        }

        const currentSelection = contents.window.getSelection();
        const hasSelection = Boolean(currentSelection && currentSelection.toString().trim());

        if (hasSelection || isDesktopSelectionPointerDown) {
          return;
        }

        pendingDesktopSelectionContents = null;
        clearPanelFromOutsideInteraction();
      };

      const onSelectionChange = () => {
        scheduleMicrotask(syncPanelWithNativeSelection);
        scheduleMicrotask(syncSelectionScrollLock);
      };

      releaseDocument.addEventListener("mousedown", onPressStart, true);
      releaseDocument.addEventListener("pointerdown", onPointerDown, true);
      releaseDocument.addEventListener("mouseup", onRelease, true);
      releaseDocument.addEventListener("pointerup", onRelease, true);
      releaseDocument.addEventListener("selectionchange", onSelectionChange);
      contents.window.addEventListener("blur", onRelease);

      selectionReleaseCleanupCallbacks.push(() => {
        releaseDocument.removeEventListener("mousedown", onPressStart, true);
        releaseDocument.removeEventListener("pointerdown", onPointerDown, true);
        releaseDocument.removeEventListener("mouseup", onRelease, true);
        releaseDocument.removeEventListener("pointerup", onRelease, true);
        releaseDocument.removeEventListener("selectionchange", onSelectionChange);
        contents.window.removeEventListener("blur", onRelease);
      });
    };

    renderContainer.innerHTML = "";
    isRenditionReadyRef.current = false;
    locationsReadyRef.current = false;
    selectedContentsRef.current = null;
    readerRuntimeIdRef.current += 1;
    translationsByCfiRef.current = new Map();
    savedVocabularyTranslationIdsRef.current = new Set();
    appliedHighlightCfisRef.current = new Set();
    loadedChapterHrefsRef.current = new Set();
    loadingChapterHrefsRef.current = new Set();
    panelSourceRef.current = null;
    setSelectionCfiRange(null);
    setSelectionChapterHref(null);
    setActiveTranslation(null);
    setIsActiveTranslationSaved(false);
    clearPendingDesktopClickToggle();
    clearPendingMobileUiToggle();
    clearPendingSelectionRelease();
    lastSavedLocationRef.current = initialLocation ?? null;
    lastSavedProgressRef.current = normalizeProgressPercentageValue(initialProgressPercentage);
    hasUserNavigatedRef.current = false;
    setLoadPhase("requesting_access");
    setReaderError(null);
    setSelectedText("");
    setContextSentence(null);
    setSelectionAnchor(null);
    setProgressPercentage(null);
    setIsSettingsOpen(false);
    setIsChromeVisible(false);
    latestRestoreLocationRef.current = initialLocation ?? null;
    latestProgressPercentageRef.current = null;
    latestChapterHrefRef.current = null;
    releaseSelectionScrollLock();
    clearStableReadingDebounce();
    clearPendingNavigationReason();
    clearRestoreGuardTimer();
    clearReaderSettingsGuardTimer();
    isRestoringInitialLocationRef.current = false;
    isApplyingReaderSettingsRef.current = false;

    const beginInitialRestorePhase = () => {
      isRestoringInitialLocationRef.current = true;
      clearStableReadingDebounce();
      clearRestoreGuardTimer();
    };

    const updateLatestLocationSnapshot = (
      restoreLocationCfi: string,
      fallbackProgressPercentage: number | null,
      relocatedPayload: RelocatedPayload | null,
    ) => {
      const { progressPercentage: nextProgressPercentage } = getProgressFromCfi(
        bookRef.current,
        restoreLocationCfi,
        locationsReadyRef.current,
        fallbackProgressPercentage,
      );

      latestRestoreLocationRef.current = restoreLocationCfi;
      latestProgressPercentageRef.current =
        typeof nextProgressPercentage === "number" ? nextProgressPercentage : null;
      latestChapterHrefRef.current = relocatedPayload
        ? getRelocatedChapterHref(relocatedPayload)
        : latestChapterHrefRef.current;

      if (typeof nextProgressPercentage === "number") {
        setProgressPercentage((current) => {
          if (typeof current === "number" && Math.abs(current - nextProgressPercentage) < 0.05) {
            return current;
          }

          return nextProgressPercentage;
        });
      }
    };

    /**
     * Loads the translations of the chapters currently on screen. In a two-page
     * spread the visible start and end can belong to different chapters, and each
     * chapter is fetched at most once per reader session.
     */
    const ensureVisibleChapterTranslationsLoaded = (payload: RelocatedPayload) => {
      const visibleChapterHrefs = new Set<string>();

      for (const cfi of [getRelocatedStartCfi(payload), getRelocatedEndCfi(payload)]) {
        const chapterHref = getChapterHrefForCfi(bookRef.current, cfi);

        if (chapterHref) {
          visibleChapterHrefs.add(chapterHref);
        }
      }

      if (visibleChapterHrefs.size === 0) {
        const fallbackChapterHref = getRelocatedChapterHref(payload);

        if (fallbackChapterHref) {
          visibleChapterHrefs.add(fallbackChapterHref);
        }
      }

      for (const chapterHref of visibleChapterHrefs) {
        void loadChapterTranslations(chapterHref);
      }
    };

    const saveStableReadingProgress = async (reason: ReadingProgressSaveReason) => {
      if (
        isCancelled ||
        !isRenditionReadyRef.current ||
        isRestoringInitialLocationRef.current ||
        isApplyingReaderSettingsRef.current
      ) {
        return;
      }

      const restoreLocationCfi = latestRestoreLocationRef.current;
      const normalizedProgressPercentage = normalizeProgressPercentageValue(
        latestProgressPercentageRef.current,
      );

      if (!restoreLocationCfi || typeof normalizedProgressPercentage !== "number") {
        return;
      }

      const isSameLocation = lastSavedLocationRef.current === restoreLocationCfi;
      const hasProgressUpdate =
        typeof lastSavedProgressRef.current !== "number"
          ? true
          : Math.abs(lastSavedProgressRef.current - normalizedProgressPercentage) >= 0.01;

      if (isSameLocation && !hasProgressUpdate) {
        return;
      }

      const currentPayload = getCurrentRenditionLocationPayload(renditionRef.current);
      const chapterHref = currentPayload
        ? getRelocatedChapterHref(currentPayload)
        : latestChapterHrefRef.current;

      const body: UpsertReadingProgressRequest = {
        bookId,
        currentLocation: restoreLocationCfi,
        progressPercentage: normalizedProgressPercentage,
        chapterHref,
        saveReason: reason,
      };

      try {
        const progressResponse = await fetch("/api/reading-progress", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!progressResponse.ok) {
          return;
        }

        lastSavedLocationRef.current = restoreLocationCfi;
        lastSavedProgressRef.current = normalizedProgressPercentage;
      } catch {
        // Ignore autosave issues to avoid interrupting reading.
      }
    };

    /**
     * Downloads the EPUB bytes with a signed URL requested right now. A failure whose
     * cause is compatible with an invalid or expired URL discards that URL completely
     * and retries once with a brand new one. `code: null` means the attempt became
     * stale and must end silently.
     */
    async function loadEpubData(): Promise<
      { ok: true; data: ArrayBuffer } | { ok: false; code: BookAccessErrorCode | null }
    > {
      const staleResult = { ok: false, code: null } as const;
      let lastErrorCode: BookAccessErrorCode = "UNKNOWN_ERROR";
      let attemptsUsed = 0;

      for (let attempt = 1; attempt <= MAX_BOOK_ACCESS_ATTEMPTS; attempt += 1) {
        attemptsUsed = attempt;
        const attemptStartedAt = Date.now();

        if (attempt > 1) {
          logBookAccessEvent("ACCESS_RETRY_STARTED", {
            bookId,
            attempt,
            previousCode: lastErrorCode,
          });
          setLoadPhase("retrying_access");
          // Each attempt gets its own budget so the retry is not born already expired.
          startLoadTimeout();
        }

        logBookAccessEvent("REQUESTING_SIGNED_URL", { bookId, attempt });

        const accessResult = await requestBookAccess({
          bookId,
          signal: abortController.signal,
        });

        if (isStaleLoadAttempt()) {
          return staleResult;
        }

        if (!accessResult.ok) {
          lastErrorCode = accessResult.code;

          if (lastErrorCode === "STORAGE_FILE_NOT_FOUND") {
            logBookAccessEvent("STORAGE_FILE_NOT_FOUND", { bookId, attempt });
          }

          if (attempt < MAX_BOOK_ACCESS_ATTEMPTS && isRetryableBookAccessErrorCode(lastErrorCode)) {
            continue;
          }

          break;
        }

        logBookAccessEvent("SIGNED_URL_CREATED", {
          bookId,
          attempt,
          expiresInSeconds: accessResult.grant.expiresInSeconds,
        });

        // Separa el coste del viaje a nuestra API del coste de descargar el EPUB.
        performanceTracker.mark("ACCESS_GRANTED", { attempt });

        const downloadResult = await downloadEpubFromSignedUrl({
          signedUrl: accessResult.grant.signedUrl,
          signal: abortController.signal,
        });

        if (isStaleLoadAttempt()) {
          return staleResult;
        }

        if (downloadResult.ok) {
          if (attempt > 1) {
            logBookAccessEvent("ACCESS_RETRY_SUCCEEDED", {
              bookId,
              attempt,
              durationMs: Date.now() - attemptStartedAt,
            });
          }

          return { ok: true, data: downloadResult.data };
        }

        lastErrorCode = downloadResult.code;

        if (lastErrorCode === "STORAGE_FILE_NOT_FOUND") {
          logBookAccessEvent("STORAGE_FILE_NOT_FOUND", { bookId, attempt });
        }

        if (attempt < MAX_BOOK_ACCESS_ATTEMPTS && isRetryableBookAccessErrorCode(lastErrorCode)) {
          continue;
        }

        break;
      }

      if (attemptsUsed > 1) {
        logBookAccessEvent("ACCESS_RETRY_FAILED", { bookId, code: lastErrorCode });
      }

      return { ok: false, code: lastErrorCode };
    }

    async function mountReader() {
      try {
        let hasAttemptedInitialRestoreCorrection = false;
        let hasAttemptedInitialLocationRecovery = false;
        const sanitizedInitialLocation = initialLocation
          ? sanitizeCfiForDisplay(initialLocation)
          : null;

        const epubDataResult = await loadEpubData();

        if (isStaleLoadAttempt()) {
          return;
        }

        if (!epubDataResult.ok) {
          if (epubDataResult.code) {
            failReaderLoad(epubDataResult.code);
          }

          return;
        }

        const epubData = epubDataResult.data;

        setLoadPhase("loading_epub");
        logBookAccessEvent("EPUB_LOAD_STARTED", { bookId });
        performanceTracker.mark("ACCESS_READY", { bytes: epubData.byteLength });

        // epub.js no rechaza `book.ready` ante un archivo corrupto: se queda colgado,
        // asi que el contenedor se comprueba antes para poder clasificarlo de verdad.
        const epubValidation = await validateEpubArrayBuffer(epubData);

        if (isStaleLoadAttempt()) {
          return;
        }

        if (!epubValidation.valid) {
          logBookAccessEvent("EPUB_INVALID", { bookId });
          failReaderLoad("EPUB_INVALID");
          return;
        }

        let book: EpubBook;
        // Only for cleanup: the instance must be released if it never became readable.
        let pendingBook: EpubBook | null = null;

        try {
          // The bytes arrived over a valid signed URL, so a failure here is the file itself.
          book = ePub(epubData);
          pendingBook = book;
          performanceTracker.mark("EPUB_INSTANCE_CREATED");
          await book.ready;
          performanceTracker.mark("BOOK_READY");
        } catch (error) {
          pendingBook?.destroy();

          if (isAbortError(error)) {
            return;
          }

          logBookAccessEvent("EPUB_INVALID", { bookId });
          failReaderLoad("EPUB_INVALID");
          return;
        }

        if (isStaleLoadAttempt()) {
          book.destroy();
          return;
        }

        const rendition = book.renderTo(renderContainer, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: isMobileViewportRef.current ? "none" : "always",
        });

        performanceTracker.mark("RENDITION_CREATED");

        registerReaderThemes(rendition);
        applyReaderAppearance(rendition, themeRef.current, fontSizeRef.current);
        applySpreadForViewport(rendition, isMobileViewportRef.current);

        const renditionContentHooks = getRenditionContentHooks(rendition);
        renditionContentHooks?.register((contents) => {
          applySelectionStylesToContents(contents, themeRef.current);
          registerSelectionReleaseTracking(contents);

          // Keep swipe navigation disabled while text selection is active.
          let touchStartX: number | null = null;
          let touchStartY: number | null = null;
          let touchIdentifier: number | null = null;

          const resetSwipeGestureState = () => {
            touchStartX = null;
            touchStartY = null;
            touchIdentifier = null;
          };

          const shouldBlockSwipeForSelection = () => {
            const hasSelection = hasActiveTextSelection();

            if (hasSelection) {
              resetSwipeGestureState();
              syncSelectionScrollLock();
            }

            return hasSelection;
          };

          const blockSwipeWhenSelectionActive = (event: TouchEvent) => {
            if (!hasActiveTextSelection()) {
              return;
            }

            resetSwipeGestureState();
            syncSelectionScrollLock();
            event.stopImmediatePropagation();
          };

          const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1 || shouldBlockSwipeForSelection()) {
              resetSwipeGestureState();
              return;
            }

            const touch = event.touches[0];

            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchIdentifier = touch.identifier;
          };

          const onTouchEnd = (event: TouchEvent) => {
            if (
              touchStartX === null ||
              touchStartY === null ||
              event.changedTouches.length === 0 ||
              shouldBlockSwipeForSelection()
            ) {
              resetSwipeGestureState();
              return;
            }

            const endedTouch =
              getTouchByIdentifier(event.changedTouches, touchIdentifier) ?? event.changedTouches[0];

            if (!endedTouch) {
              resetSwipeGestureState();
              return;
            }

            const endX = endedTouch.clientX;
            const endY = endedTouch.clientY;
            const deltaX = endX - touchStartX;
            const deltaY = endY - touchStartY;

            // Ignore if primarily vertical swipe
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
              resetSwipeGestureState();
              return;
            }

            // Require minimum horizontal movement (40px)
            if (Math.abs(deltaX) < MOBILE_SWIPE_THRESHOLD_PX) {
              resetSwipeGestureState();
              return;
            }

            if (deltaX > 0) {
              // Swiped right → Previous page
              void rendition.prev();
            } else {
              // Swiped left → Next page
              void rendition.next();
            }

            resetSwipeGestureState();
          };

          const onTouchCancel = () => {
            resetSwipeGestureState();
          };

          contents.document.addEventListener("touchstart", blockSwipeWhenSelectionActive, {
            capture: true,
            passive: false,
          });
          contents.document.addEventListener("touchmove", blockSwipeWhenSelectionActive, {
            capture: true,
            passive: false,
          });
          contents.document.addEventListener("touchend", blockSwipeWhenSelectionActive, {
            capture: true,
            passive: false,
          });
          contents.document.addEventListener("touchcancel", blockSwipeWhenSelectionActive, {
            capture: true,
            passive: false,
          });

          contents.document.addEventListener("touchstart", onTouchStart, { passive: true });
          contents.document.addEventListener("touchend", onTouchEnd, { passive: true });
          contents.document.addEventListener("touchcancel", onTouchCancel, { passive: true });

          // Cleanup on unmount
          selectionReleaseCleanupCallbacks.push(() => {
            contents.document.removeEventListener("touchstart", blockSwipeWhenSelectionActive, true);
            contents.document.removeEventListener("touchmove", blockSwipeWhenSelectionActive, true);
            contents.document.removeEventListener("touchend", blockSwipeWhenSelectionActive, true);
            contents.document.removeEventListener("touchcancel", blockSwipeWhenSelectionActive, true);
            contents.document.removeEventListener("touchstart", onTouchStart);
            contents.document.removeEventListener("touchend", onTouchEnd);
            contents.document.removeEventListener("touchcancel", onTouchCancel);
          });
        });

        bookRef.current = book;
        renditionRef.current = rendition;

        const renditionManager = getRenditionManager(rendition);
        const renditionScrollContainer = renditionManager?.container ?? null;

        if (renditionScrollContainer) {
          const handleRenditionScrollWhileSelectionIsActive = () => {
            if (isSyncingSelectionScrollRef.current) {
              return;
            }

            syncSelectionScrollLock();
          };

          renditionScrollContainer.addEventListener(
            "scroll",
            handleRenditionScrollWhileSelectionIsActive,
            { passive: true },
          );

          selectionReleaseCleanupCallbacks.push(() => {
            renditionScrollContainer.removeEventListener(
              "scroll",
              handleRenditionScrollWhileSelectionIsActive,
            );
          });
        }

        selectionHandler = (...args: unknown[]) => {
          try {
            const possibleContents = args[1];

            if (!possibleContents || typeof possibleContents !== "object") {
              return;
            }

            const contents = possibleContents as EpubContents;
            const eventCfiRange = normalizeCfi(args[0]);
            registerSelectionReleaseTracking(contents);

            const shouldWaitForRelease =
              !isMobileViewportRef.current && !isTouchLikeDeviceRef.current;

            if (!shouldWaitForRelease) {
              commitSelectionFromContents(contents, eventCfiRange);
              return;
            }

            if (isDesktopSelectionPointerDown) {
              pendingDesktopSelectionContents = contents;
              pendingDesktopSelectionCfiRange = eventCfiRange;
              return;
            }

            commitSelectionFromContents(contents, eventCfiRange);
          } catch {
            // Ignore selection extraction errors and keep reader responsive.
          }
        };

        markClickedHandler = (...args: unknown[]) => {
          if (isCancelled) {
            return;
          }

          const cfiRange = normalizeCfi(args[0]);

          if (!cfiRange) {
            return;
          }

          const translation = getCachedTranslation(cfiRange);

          if (!translation) {
            return;
          }

          // epub.js emits "click" before "markClicked", so cancel the pending
          // reader-chrome toggle instead of letting a highlight tap trigger it.
          clearPendingDesktopClickToggle();
          clearPendingMobileUiToggle();

          const possibleContents = args[2];
          const contents =
            possibleContents && typeof possibleContents === "object"
              ? (possibleContents as EpubContents)
              : selectedContentsRef.current;

          lastMarkClickedAt = Date.now();
          logBookTranslationEvent("FOUND");
          openPanelForTranslation(translation, contents);
        };

        relocatedHandler = (...args: unknown[]) => {
          const relocatedPayload = (args[0] ?? null) as RelocatedPayload | null;

          if (!relocatedPayload) {
            return;
          }

          const currentLocationCfi = getStableStartCfi(relocatedPayload);
          const fallbackProgressPercentage = getRelocatedFallbackProgress(relocatedPayload);

          if (!currentLocationCfi || isCancelled) {
            return;
          }

          updateLatestLocationSnapshot(
            currentLocationCfi,
            fallbackProgressPercentage ?? latestProgressPercentageRef.current,
            relocatedPayload,
          );

          ensureVisibleChapterTranslationsLoaded(relocatedPayload);

          // A panel opened from a highlight has no selection to hold it in place.
          if (panelSourceRef.current === "highlight") {
            clearSelection();
          }

          if (
            isRestoringInitialLocationRef.current &&
            !hasUserNavigatedRef.current &&
            !hasAttemptedInitialLocationRecovery &&
            initialLocation
          ) {
            const restoreComparison = compareCfiPosition(currentLocationCfi, initialLocation);

            if (restoreComparison !== null && restoreComparison < 0) {
              const recoveryCandidates: Array<{
                strategy: "initial" | "sanitized" | "nudged-initial" | "nudged-sanitized";
                cfi: string | null;
              }> = [
                { strategy: "initial", cfi: initialLocation },
                {
                  strategy: "sanitized",
                  cfi:
                    sanitizedInitialLocation && sanitizedInitialLocation !== initialLocation
                      ? sanitizedInitialLocation
                      : null,
                },
                { strategy: "nudged-initial", cfi: nudgeCfiForward(initialLocation) },
                {
                  strategy: "nudged-sanitized",
                  cfi: sanitizedInitialLocation
                    ? nudgeCfiForward(sanitizedInitialLocation)
                    : null,
                },
              ];

              const nextRecovery = recoveryCandidates.find(
                (candidate): candidate is {
                  strategy: "initial" | "sanitized" | "nudged-initial" | "nudged-sanitized";
                  cfi: string;
                } => typeof candidate.cfi === "string" && candidate.cfi !== currentLocationCfi,
              );

              if (nextRecovery) {
                hasAttemptedInitialLocationRecovery = true;

                beginInitialRestorePhase();
                void rendition.display(nextRecovery.cfi)
                  .catch(() => {
                    // Ignore one-off recovery failures and keep the current rendered location.
                  })
                  .finally(() => {
                    scheduleRestoreGuardRelease();
                  });

                return;
              }
            }
          }

          if (isRestoringInitialLocationRef.current || isApplyingReaderSettingsRef.current) {
            return;
          }

          const pendingNavigationReason = pendingNavigationReasonRef.current;

          if (pendingNavigationReason === "next" || pendingNavigationReason === "prev") {
            clearStableReadingDebounce();
            const expectedStableLocation = currentLocationCfi;
            clearPendingNavigationReason();
            stableReadingTimerRef.current = setTimeout(() => {
              stableReadingTimerRef.current = null;

              if (isCancelled) {
                return;
              }

              if (isRestoringInitialLocationRef.current || isApplyingReaderSettingsRef.current) {
                return;
              }

              if (latestRestoreLocationRef.current !== expectedStableLocation) {
                return;
              }

              void saveStableReadingProgress(pendingNavigationReason);
            }, STABLE_READING_SAVE_DEBOUNCE_MS);
            return;
          }

          clearStableReadingDebounce();
          const expectedStableLocation = currentLocationCfi;

          stableReadingTimerRef.current = setTimeout(() => {
            stableReadingTimerRef.current = null;

            if (isCancelled) {
              return;
            }

            if (isRestoringInitialLocationRef.current || isApplyingReaderSettingsRef.current) {
              return;
            }

            if (latestRestoreLocationRef.current !== expectedStableLocation) {
              return;
            }

            void saveStableReadingProgress("stable_reading");
          }, STABLE_READING_SAVE_DEBOUNCE_MS);
        };

        clickHandler = (...args: unknown[]) => {
          if (isCancelled) {
            return;
          }

          if (isSettingsOpenRef.current) {
            setIsSettingsOpen(false);
            return;
          }

          const nativeSelection = selectedContentsRef.current?.window.getSelection();

          if (nativeSelection && nativeSelection.toString().trim()) {
            return;
          }

          const shouldPreserveCurrentBehavior =
            isMobileViewportRef.current || isTouchLikeDeviceRef.current;

          // Touch only: this click belongs to the tap that just opened a highlight panel.
          if (
            shouldPreserveCurrentBehavior &&
            panelSourceRef.current === "highlight" &&
            Date.now() - lastMarkClickedAt < TOUCH_MARK_CLICK_FOLLOW_UP_MS
          ) {
            return;
          }

          if (selectedTextRef.current) {
            clearPanelFromOutsideInteraction();
            return;
          }

          if (shouldPreserveCurrentBehavior) {
            // Deferred by one task so a highlight that reports "markClicked" after the
            // click (mouse input on a touch-capable device) opens the panel instead of
            // toggling the chrome.
            clearPendingMobileUiToggle();
            pendingMobileUiToggleTimerRef.current = setTimeout(() => {
              pendingMobileUiToggleTimerRef.current = null;

              if (isCancelled) {
                return;
              }

              toggleReaderUi();
            }, 0);
            return;
          }

          if (pendingDesktopClickTimerRef.current) {
            clearPendingDesktopClickToggle();
            return;
          }

          const clickEvent = args[0] as { detail?: unknown } | undefined;
          const clickDetail =
            typeof clickEvent?.detail === "number" && Number.isFinite(clickEvent.detail)
              ? clickEvent.detail
              : 1;

          if (clickDetail >= 2) {
            clearPendingDesktopClickToggle();
            return;
          }

          pendingDesktopClickTimerRef.current = setTimeout(() => {
            pendingDesktopClickTimerRef.current = null;

            if (isCancelled) {
              return;
            }

            const delayedSelection = selectedContentsRef.current?.window.getSelection();

            if (delayedSelection && delayedSelection.toString().trim()) {
              return;
            }

            if (selectedTextRef.current) {
              return;
            }

            toggleReaderUi();
          }, DESKTOP_SINGLE_CLICK_DELAY_MS);
        };

        const renditionEvents = getRenditionEvents(rendition);

        renditionEvents.on("selected", selectionHandler);
        renditionEvents.on("relocated", relocatedHandler);
        renditionEvents.on("click", clickHandler);
        renditionEvents.on("markClicked", markClickedHandler);

        const prepareLocationsInBackground = async () => {
          try {
            await book.ready;

            if (isCancelled) {
              return;
            }

            const locations = getBookLocations(book);

            if (!locations) {
              return;
            }

            performanceTracker.mark("LOCATIONS_GENERATION_STARTED");

            let hasUsableLocations = false;
            const cachedLocations = readCachedLocations(bookId);
            const probeCfi = initialLocation ?? getCurrentRenditionCfi(renditionRef.current);

            if (cachedLocations && typeof locations.load === "function") {
              try {
                locations.load(cachedLocations);

                if (probeCfi) {
                  hasUsableLocations = isValidEpubPercentage(locations.percentageFromCfi(probeCfi));
                } else {
                  hasUsableLocations = true;
                }

                if (!hasUsableLocations) {
                  clearCachedLocations(bookId);
                }
              } catch {
                clearCachedLocations(bookId);
              }
            }

            if (!hasUsableLocations) {
              await locations.generate(LOCATIONS_GENERATE_CHARS);

              if (isCancelled) {
                return;
              }

              hasUsableLocations = true;

              if (typeof locations.save === "function") {
                const savedLocations = locations.save();
                persistCachedLocations(bookId, savedLocations);
              }
            }

            locationsReadyRef.current = hasUsableLocations;
            performanceTracker.mark("LOCATIONS_GENERATION_FINISHED", {
              fromCache: hasUsableLocations && Boolean(cachedLocations),
            });

            const maybeCorrectInitialRestoreFromProgress = async () => {
              if (hasAttemptedInitialRestoreCorrection || isCancelled || hasUserNavigatedRef.current) {
                return;
              }

              hasAttemptedInitialRestoreCorrection = true;

              const normalizedInitialProgressPercentage = normalizeProgressPercentageValue(
                initialProgressPercentage,
              );

              if (
                typeof normalizedInitialProgressPercentage !== "number" ||
                normalizedInitialProgressPercentage <= 0 ||
                normalizedInitialProgressPercentage >= 100
              ) {
                return;
              }

              const currentCfi = getCurrentRenditionCfi(renditionRef.current);

              if (!currentCfi) {
                return;
              }

              const { progressPercentage: currentProgressPercentage } = getProgressFromCfi(
                bookRef.current,
                currentCfi,
                true,
                normalizedInitialProgressPercentage,
              );

              if (typeof currentProgressPercentage !== "number") {
                return;
              }

              const delta = Math.abs(
                currentProgressPercentage - normalizedInitialProgressPercentage,
              );

              if (delta < INITIAL_RESTORE_PROGRESS_DELTA_THRESHOLD) {
                return;
              }

              if (typeof locations.cfiFromPercentage !== "function") {
                return;
              }

              const correctedCfi = normalizeCfi(
                locations.cfiFromPercentage(normalizedInitialProgressPercentage / 100),
              );

              if (!correctedCfi || correctedCfi === currentCfi) {
                return;
              }

              try {
                beginInitialRestorePhase();
                await rendition.display(correctedCfi);
              } catch {
                // Keep the first restored location if percentage-based correction fails.
              } finally {
                scheduleRestoreGuardRelease();
              }
            };

            if (locationsReadyRef.current) {
              await maybeCorrectInitialRestoreFromProgress();

              if (isCancelled) {
                return;
              }
            }

            if (locationsReadyRef.current) {
              const currentPayload = getCurrentRenditionLocationPayload(renditionRef.current);

              if (currentPayload) {
                const currentCfi = getStableStartCfi(currentPayload);
                const fallbackProgressPercentage = getRelocatedFallbackProgress(currentPayload);

                if (currentCfi) {
                  updateLatestLocationSnapshot(
                    currentCfi,
                    fallbackProgressPercentage ?? latestProgressPercentageRef.current,
                    currentPayload,
                  );
                }
              }
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
              return;
            }

            // Keep reading available even if locations generation fails.
            locationsReadyRef.current = false;
          }
        };

        const handleResize = () => {
          if (!isRenditionReadyRef.current) {
            return;
          }

          const activeRendition = renditionRef.current;

          if (!activeRendition) {
            return;
          }

          applySpreadForViewport(activeRendition, isMobileViewportRef.current);

          const dimensions = getContainerDimensions(renderContainer);

          if (!dimensions) {
            return;
          }

          try {
            activeRendition.resize(dimensions.width, dimensions.height);
          } catch {
            // Ignore transient resize race conditions while epub.js is settling.
          }
        };

        resizeRendition = handleResize;

        performanceTracker.mark("FIRST_DISPLAY_STARTED", { restoring: Boolean(initialLocation) });

        if (initialLocation) {
          beginInitialRestorePhase();
          try {
            await rendition.display(initialLocation);
          } catch {
            if (sanitizedInitialLocation && sanitizedInitialLocation !== initialLocation) {
              try {
                await rendition.display(sanitizedInitialLocation);
              } catch {
                await rendition.display();
              }
            } else {
              await rendition.display();
            }
          } finally {
            scheduleRestoreGuardRelease();
          }

          performanceTracker.mark("PROGRESS_RESTORED");
        } else {
          await rendition.display();
        }

        isRenditionReadyRef.current = true;

        window.addEventListener("resize", handleResize);

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            handleResize();
          });
          resizeObserver.observe(renderContainer);
        }

        handleResize();

        if (!isStaleLoadAttempt()) {
          clearLoadTimeout();
          setLoadPhase("ready");
          performanceTracker.mark("FIRST_PAGE_VISIBLE");
        }

        // Fuera del camino critico: generar locations es lo mas caro en libros grandes y
        // no hace falta para pintar la pagina inicial ni para restaurar el CFI guardado.
        runAfterFirstPaint(() => {
          if (isStaleLoadAttempt()) {
            return;
          }

          void prepareLocationsInBackground();
        });
      } catch (error) {
        if (isStaleLoadAttempt()) {
          return;
        }

        if (isAbortError(error)) {
          return;
        }

        const loadErrorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("EpubReader load error:", loadErrorMessage);

        // Reached only after the bytes were downloaded and epub.js took over.
        logBookAccessEvent("EPUB_INVALID", { bookId });
        failReaderLoad("EPUB_INVALID");
      }
    }

    let teardownTimer: ReturnType<typeof setTimeout> | null = null;

    const runtimeHandle: ReaderRuntimeHandle = {
      key: runtimeKey,
      container: renderContainer,
      keepAlive: () => {
        // Solo puede ocurrir dentro del mismo commit de React, antes de que ninguna
        // promesa en curso haya podido observar la cancelacion.
        if (teardownTimer) {
          clearTimeout(teardownTimer);
          teardownTimer = null;
        }

        isCancelled = false;
      },
      scheduleTeardown: () => {
        // La cancelacion es inmediata para que nada actualice estado ya desmontado,
        // pero la destruccion se aplaza un tick por si React vuelve a montar el efecto.
        isCancelled = true;

        if (teardownTimer) {
          return;
        }

        teardownTimer = setTimeout(() => {
          teardownTimer = null;

          if (activeReaderRuntimeRef.current === runtimeHandle) {
            activeReaderRuntimeRef.current = null;
          }

          clearLoadTimeout();
          teardownReaderRuntime();
        }, 0);
      },
    };

    activeReaderRuntimeRef.current = runtimeHandle;

    startLoadTimeout();

    void mountReader();

    return () => {
      runtimeHandle.scheduleTeardown();
    };
    // El libro solo se reconstruye cuando cambia el recurso (`bookId`) o se pide una
    // recarga manual (`reloadToken`). `initialLocation` e `initialProgressPercentage`
    // se leen del render vigente en ese momento: incluirlos reconstruiria el lector
    // entero cada vez que el propio lector guarda progreso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bookId,
    clearPendingNavigationReason,
    clearPendingDesktopClickToggle,
    clearPendingMobileUiToggle,
    clearReaderSettingsGuardTimer,
    clearRestoreGuardTimer,
    clearSelection,
    clearStableReadingDebounce,
    getCachedTranslation,
    hasActiveTextSelection,
    loadChapterTranslations,
    openPanelForTranslation,
    releaseSelectionScrollLock,
    reloadToken,
    scheduleRestoreGuardRelease,
    syncSelectionScrollLock,
    clearPanelFromOutsideInteraction,
    setSelectionAnchor,
    toggleReaderUi,
  ]);

  const goToPreviousPage = useCallback(async () => {
    if (!renditionRef.current) {
      return;
    }

    try {
      hasUserNavigatedRef.current = true;
      clearStableReadingDebounce();
      setPendingNavigationReason("prev");
      clearSelection();
      await renditionRef.current.prev();
    } catch {
      clearPendingNavigationReason();
      setReaderError("Could not navigate to the previous page.");
    }
  }, [clearPendingNavigationReason, clearSelection, clearStableReadingDebounce, setPendingNavigationReason]);

  const goToNextPage = useCallback(async () => {
    if (!renditionRef.current) {
      return;
    }

    try {
      hasUserNavigatedRef.current = true;
      clearStableReadingDebounce();
      setPendingNavigationReason("next");
      clearSelection();
      await renditionRef.current.next();
    } catch {
      clearPendingNavigationReason();
      setReaderError("Could not navigate to the next page.");
    }
  }, [clearPendingNavigationReason, clearSelection, clearStableReadingDebounce, setPendingNavigationReason]);

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden",
        theme === "dark" ? "text-slate-100" : "text-slate-900",
      )}
      style={{ backgroundColor: themePalette.appBackground, color: themePalette.appText }}
    >
      <ReaderTopBar
        title={bookTitle}
        author={bookAuthor}
        isVisible={isReaderUiVisible}
        progressPercentage={progressPercentage}
        onBack={navigateBackToLibrary}
        onOpenSettings={openSettings}
      />

      <ReaderControls
        isVisible={isReaderUiVisible}
        isReady={isReady}
        progressPercentage={progressPercentage}
        onPrev={goToPreviousPage}
        onNext={goToNextPage}
      />

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          ref={containerRef}
          className="h-full w-full min-h-0 overflow-hidden"
          style={{
            backgroundColor: themePalette.epubBackground,
          }}
        />

        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center px-4"
            style={{ backgroundColor: themePalette.loadingOverlay }}
          >
            <p className={cn("text-sm", theme === "dark" ? "text-slate-200" : "text-slate-600")}>
              Opening book...
            </p>
          </div>
        )}

        {readerError && (
          <div className="absolute left-3 right-3 top-3 z-50 flex justify-center">
            <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50/95 p-3 shadow-sm backdrop-blur">
              <p className="text-sm text-red-700">{readerError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={navigateBackToLibrary}
                  className="inline-flex h-9 items-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Back to Library
                </button>
                <button
                  type="button"
                  onClick={retryReaderLoad}
                  className="inline-flex h-9 items-center rounded-md border border-red-200 bg-red-100 px-3 text-sm font-medium text-red-700 hover:bg-red-200"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        <ReaderSettingsPanel
          isOpen={isSettingsOpen}
          theme={theme}
          fontSize={fontSize}
          minFontSize={MIN_READER_FONT_SIZE}
          maxFontSize={MAX_READER_FONT_SIZE}
          onClose={closeSettings}
          onThemeChange={setTheme}
          onDecreaseFontSize={decreaseFontSize}
          onIncreaseFontSize={increaseFontSize}
        />

        {selectedText && (
          <div ref={panelContainerRef} className={panelLayout.wrapperClassName} style={panelLayout.style}>
            <SelectionPanel
              bookId={bookId}
              selectedText={selectedText}
              contextSentence={contextSentence}
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              variant={panelLayout.variant}
              cfiRange={selectionCfiRange}
              chapterHref={selectionChapterHref}
              storedTranslation={activeTranslation}
              isVocabularyAlreadySaved={isActiveTranslationSaved}
              onStoredTranslationFound={handleStoredTranslationFound}
              onTranslationReady={handleTranslationReady}
              onPersistTranslation={persistTranslation}
              onVocabularySaved={markTranslationSaved}
            />
          </div>
        )}
      </div>
    </section>
  );
}
