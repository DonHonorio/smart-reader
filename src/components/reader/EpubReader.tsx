"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ePub, { type Book as EpubBook, type Contents as EpubContents, type Rendition } from "epubjs";
import { ReaderControls } from "@/components/reader/ReaderControls";
import { ReaderSettingsPanel } from "@/components/reader/ReaderSettingsPanel";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { SelectionPanel } from "@/components/reader/SelectionPanel";
import { ROUTES } from "@/lib/constants";
import { extractContextSentenceFromSelection } from "@/lib/text";
import { cn } from "@/lib/utils";
import type {
  EpubReaderProps,
  ReadingProgressSaveReason,
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

const READER_PREFERENCES_STORAGE_KEY = "smart-reader:reader-preferences:v1";
const DEFAULT_READER_THEME: ReaderTheme = "light";
const DEFAULT_READER_FONT_SIZE = 100;
const MIN_READER_FONT_SIZE = 80;
const MAX_READER_FONT_SIZE = 150;
const READER_FONT_SIZE_STEP = 10;
const DESKTOP_SPREAD_BREAKPOINT = 1024;
const DESKTOP_SINGLE_CLICK_DELAY_MS = 220;
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

type SelectionAnchor = {
  centerX: number;
  top: number;
  bottom: number;
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

function getLoadErrorMessage(status: number) {
  if (status === 400 || status === 401 || status === 403) {
    return "This reading link expired. Please reopen the book from your library.";
  }

  if (status === 404) {
    return "The EPUB file could not be opened.";
  }

  return "We could not load this book.";
}

function getSelectionAnchor(selection: Selection, contents: EpubContents) {
  if (selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
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

export function EpubReader({
  fileUrl,
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

  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [contextSentence, setContextSentence] = useState<string | null>(null);
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
    setSelectedText("");
    setContextSentence(null);
    setSelectionAnchor(null);
  }, []);

  const clearPendingDesktopClickToggle = useCallback(() => {
    if (pendingDesktopClickTimerRef.current) {
      clearTimeout(pendingDesktopClickTimerRef.current);
      pendingDesktopClickTimerRef.current = null;
    }
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
    setErrorMessage(null);
    clearSelection();
    router.refresh();
  }, [clearSelection, router]);

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
    let isDesktopSelectionPointerDown = false;
    let pendingDesktopSelectionContents: EpubContents | null = null;
    const selectionReleaseCleanupCallbacks: Array<() => void> = [];
    const selectionTrackedDocuments = new WeakSet<Document>();
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const renderContainer: HTMLDivElement = container;

    const clearPendingSelectionRelease = () => {
      pendingDesktopSelectionContents = null;
      isDesktopSelectionPointerDown = false;

      for (const cleanup of selectionReleaseCleanupCallbacks) {
        cleanup();
      }

      selectionReleaseCleanupCallbacks.length = 0;
    };

    const commitSelectionFromContents = (contents: EpubContents) => {
      const selection = contents.window.getSelection();

      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const extractedContext = extractContextSentenceFromSelection(selection);

      if (!extractedContext.selectedText) {
        return;
      }

      clearPendingDesktopClickToggle();
      selectedContentsRef.current = contents;
      setSelectionAnchor(getSelectionAnchor(selection, contents));
      setSelectedText(extractedContext.selectedText);
      setContextSentence(extractedContext.contextSentence);
    };

    const flushPendingDesktopSelection = () => {
      const pendingContents = pendingDesktopSelectionContents;

      if (!pendingContents) {
        return;
      }

      pendingDesktopSelectionContents = null;
      commitSelectionFromContents(pendingContents);
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
    clearPendingDesktopClickToggle();
    clearPendingSelectionRelease();
    lastSavedLocationRef.current = initialLocation ?? null;
    lastSavedProgressRef.current = normalizeProgressPercentageValue(initialProgressPercentage);
    hasUserNavigatedRef.current = false;
    setIsLoading(true);
    setIsReady(false);
    setErrorMessage(null);
    setSelectedText("");
    setContextSentence(null);
    setSelectionAnchor(null);
    setProgressPercentage(null);
    setIsSettingsOpen(false);
    setIsChromeVisible(false);
    latestRestoreLocationRef.current = initialLocation ?? null;
    latestProgressPercentageRef.current = null;
    latestChapterHrefRef.current = null;
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

    const saveStableReadingProgress = async (reason: ReadingProgressSaveReason) => {
      if (isCancelled || isRestoringInitialLocationRef.current || isApplyingReaderSettingsRef.current) {
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

    async function mountReader() {
      try {
        let hasAttemptedInitialRestoreCorrection = false;
        let hasAttemptedInitialLocationRecovery = false;
        const sanitizedInitialLocation = initialLocation
          ? sanitizeCfiForDisplay(initialLocation)
          : null;

        const response = await fetch(fileUrl, {
          method: "GET",
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (!isCancelled) {
            setErrorMessage(getLoadErrorMessage(response.status));
            setIsLoading(false);
            setIsReady(false);
          }

          return;
        }

        const epubData = await response.arrayBuffer();

        if (isCancelled) {
          return;
        }

        const book = ePub(epubData);
        const rendition = book.renderTo(renderContainer, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: isMobileViewportRef.current ? "none" : "always",
        });

        registerReaderThemes(rendition);
        applyReaderAppearance(rendition, themeRef.current, fontSizeRef.current);
        applySpreadForViewport(rendition, isMobileViewportRef.current);

        const renditionContentHooks = getRenditionContentHooks(rendition);
        renditionContentHooks?.register((contents) => {
          applySelectionStylesToContents(contents, themeRef.current);
          registerSelectionReleaseTracking(contents);

          // Simple touch-based swipe for page navigation on mobile
          let touchStartX: number | null = null;
          let touchStartY: number | null = null;

          const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
              touchStartX = null;
              touchStartY = null;
              return;
            }

            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
          };

          const onTouchEnd = (event: TouchEvent) => {
            if (touchStartX === null || touchStartY === null || event.changedTouches.length === 0) {
              return;
            }

            const endX = event.changedTouches[0].clientX;
            const endY = event.changedTouches[0].clientY;
            const deltaX = endX - touchStartX;
            const deltaY = endY - touchStartY;

            // Ignore if primarily vertical swipe
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
              return;
            }

            // Require minimum horizontal movement (40px)
            if (Math.abs(deltaX) < MOBILE_SWIPE_THRESHOLD_PX) {
              return;
            }

            if (selectedTextRef.current) {
              return;
            }

            if (deltaX > 0) {
              // Swiped right → Previous page
              void rendition.prev();
            } else {
              // Swiped left → Next page
              void rendition.next();
            }

            touchStartX = null;
            touchStartY = null;
          };

          contents.document.addEventListener("touchstart", onTouchStart, { passive: true });
          contents.document.addEventListener("touchend", onTouchEnd, { passive: true });

          // Cleanup on unmount
          selectionReleaseCleanupCallbacks.push(() => {
            contents.document.removeEventListener("touchstart", onTouchStart);
            contents.document.removeEventListener("touchend", onTouchEnd);
          });
        });

        bookRef.current = book;
        renditionRef.current = rendition;

        selectionHandler = (...args: unknown[]) => {
          try {
            const possibleContents = args[1];

            if (!possibleContents || typeof possibleContents !== "object") {
              return;
            }

            const contents = possibleContents as EpubContents;
            registerSelectionReleaseTracking(contents);

            const shouldWaitForRelease =
              !isMobileViewportRef.current && !isTouchLikeDeviceRef.current;

            if (!shouldWaitForRelease) {
              commitSelectionFromContents(contents);
              return;
            }

            if (isDesktopSelectionPointerDown) {
              pendingDesktopSelectionContents = contents;
              return;
            }

            commitSelectionFromContents(contents);
          } catch {
            // Ignore selection extraction errors and keep reader responsive.
          }
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

          if (selectedTextRef.current) {
            clearPanelFromOutsideInteraction();
            return;
          }

          const shouldPreserveCurrentBehavior =
            isMobileViewportRef.current || isTouchLikeDeviceRef.current;

          if (shouldPreserveCurrentBehavior) {
            toggleReaderUi();
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

        void prepareLocationsInBackground();

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

        if (!isCancelled) {
          setIsReady(true);
          setIsLoading(false);
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("EpubReader load error:", error);

        if (!isCancelled) {
          setErrorMessage("The EPUB file could not be opened.");
          setIsLoading(false);
          setIsReady(false);
        }
      }
    }

    void mountReader();

    return () => {
      isCancelled = true;
      clearStableReadingDebounce();
      clearPendingNavigationReason();
      clearRestoreGuardTimer();
      clearReaderSettingsGuardTimer();
      isRestoringInitialLocationRef.current = false;
      isApplyingReaderSettingsRef.current = false;
      abortController.abort();
      isRenditionReadyRef.current = false;
      locationsReadyRef.current = false;
      if (resizeRendition) {
        window.removeEventListener("resize", resizeRendition);
      }
      resizeObserver?.disconnect();
      clearPendingDesktopClickToggle();
      clearPendingSelectionRelease();
      if (selectionHandler && renditionRef.current) {
        getRenditionEvents(renditionRef.current).off("selected", selectionHandler);
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
  }, [
    bookId,
    clearPendingNavigationReason,
    clearPendingDesktopClickToggle,
    clearReaderSettingsGuardTimer,
    clearRestoreGuardTimer,
    clearStableReadingDebounce,
    fileUrl,
    initialLocation,
    initialProgressPercentage,
    scheduleRestoreGuardRelease,
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
      setErrorMessage("Could not navigate to the previous page.");
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
      setErrorMessage("Could not navigate to the next page.");
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
              Loading reader...
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="absolute left-3 right-3 top-3 z-50 flex justify-center">
            <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50/95 p-3 shadow-sm backdrop-blur">
              <p className="text-sm text-red-700">{errorMessage}</p>
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
            />
          </div>
        )}
      </div>
    </section>
  );
}
