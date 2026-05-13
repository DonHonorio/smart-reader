"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ePub, { type Book as EpubBook, type Contents as EpubContents, type Rendition } from "epubjs";
import { Button } from "@/components/ui/Button";
import { SelectionPanel } from "@/components/reader/SelectionPanel";
import { extractContextSentenceFromSelection } from "@/lib/text";
import type { EpubReaderProps, UpsertReadingProgressRequest } from "@/types";

const SAVE_PROGRESS_DEBOUNCE_MS = 800;
const LOCATIONS_GENERATE_CHARS = 1000;
const LOCATIONS_CACHE_VERSION = "v3";
const LOCATIONS_CACHE_KEY_PREFIX = "smart-reader:locations:";

type RelocatedPayload = {
  percentage?: unknown;
  start?: {
    cfi?: unknown;
    percentage?: unknown;
    displayed?: {
      page?: unknown;
      total?: unknown;
    };
  };
  end?: {
    cfi?: unknown;
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
  load?: (locations: unknown) => unknown;
  save?: () => unknown;
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

  if (typeof page !== "number" || typeof total !== "number" || !Number.isFinite(page) || !Number.isFinite(total) || total <= 0) {
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

function getRelocatedStartCfi(payload: RelocatedPayload) {
  return normalizeCfi(payload.start?.cfi);
}

function getRelocatedEndCfi(payload: RelocatedPayload) {
  return normalizeCfi(payload.end?.cfi);
}

function getCurrentRenditionCfi(rendition: Rendition | null) {
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

  const currentLocation = getCurrentLocation() as RelocatedPayload | null;

  if (!currentLocation) {
    return null;
  }

  return getRelocatedStartCfi(currentLocation) ?? getRelocatedEndCfi(currentLocation);
}

function getLoadErrorMessage(status: number) {
  if (status === 400 || status === 401 || status === 403) {
    return "Reader session expired. Go back to Library and reopen the book.";
  }

  if (status === 404) {
    return "EPUB file not found. Reopen the book from Library.";
  }

  return "Could not load this EPUB file right now. Please try again from Library.";
}

export function EpubReader({
  fileUrl,
  bookId,
  sourceLanguage,
  targetLanguage,
  initialLocation,
}: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const selectedContentsRef = useRef<EpubContents | null>(null);
  const saveProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedLocationRef = useRef<string | null>(null);
  const lastSavedProgressRef = useRef<number | null>(null);
  const locationsReadyRef = useRef(false);
  const isRenditionReadyRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [contextSentence, setContextSentence] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    const nativeSelection = selectedContentsRef.current?.window.getSelection();
    nativeSelection?.removeAllRanges();
    setSelectedText("");
    setContextSentence(null);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();
    let resizeObserver: ResizeObserver | null = null;
    let resizeRendition: (() => void) | null = null;
    let selectionHandler: ((cfiRange: string, contents: EpubContents) => void) | null = null;
    let relocatedHandler: ((location: unknown) => void) | null = null;
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const renderContainer: HTMLDivElement = container;

    renderContainer.innerHTML = "";
    isRenditionReadyRef.current = false;
    locationsReadyRef.current = false;
    selectedContentsRef.current = null;
    if (saveProgressTimerRef.current) {
      clearTimeout(saveProgressTimerRef.current);
      saveProgressTimerRef.current = null;
    }
    lastSavedLocationRef.current = initialLocation ?? null;
    lastSavedProgressRef.current = null;
    setIsLoading(true);
    setIsReady(false);
    setErrorMessage(null);
    setSelectedText("");
    setContextSentence(null);

    async function mountReader() {
      try {
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
          spread: "none",
        });

        bookRef.current = book;
        renditionRef.current = rendition;

        const saveProgressForCfi = (
          currentLocationCfi: string,
          progressCfi?: string | null,
          fallbackProgressPercentage: number | null = null,
        ) => {
          if (isCancelled) {
            return;
          }

          const effectiveProgressCfi = progressCfi ?? currentLocationCfi;

          const { percentage, progressPercentage } = getProgressFromCfi(
            bookRef.current,
            effectiveProgressCfi,
            locationsReadyRef.current,
            fallbackProgressPercentage,
          );
          const isSameLocation = lastSavedLocationRef.current === currentLocationCfi;
          const hasProgressUpdate =
            typeof progressPercentage === "number" &&
            (typeof lastSavedProgressRef.current !== "number" ||
              Math.abs(lastSavedProgressRef.current - progressPercentage) >= 0.01);

          if (isSameLocation && !hasProgressUpdate) {
            return;
          }

          if (saveProgressTimerRef.current) {
            clearTimeout(saveProgressTimerRef.current);
          }

          saveProgressTimerRef.current = setTimeout(async () => {
            if (isCancelled) {
              return;
            }

            try {
              const body: UpsertReadingProgressRequest = {
                bookId,
                currentLocation: currentLocationCfi,
                ...(typeof progressPercentage === "number" ? { progressPercentage } : {}),
              };

              if (process.env.NODE_ENV !== "production") {
                console.log("Reading progress", {
                  currentLocationCfi,
                  progressCfi: effectiveProgressCfi,
                  percentage,
                  progressPercentage,
                  locationsReady: locationsReadyRef.current,
                });
              }

              const response = await fetch("/api/reading-progress", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: abortController.signal,
              });

              if (!response.ok) {
                return;
              }

              lastSavedLocationRef.current = currentLocationCfi;
              if (typeof progressPercentage === "number") {
                lastSavedProgressRef.current = progressPercentage;
              }
            } catch {
              // Ignore autosave issues to avoid interrupting reading.
            }
          }, SAVE_PROGRESS_DEBOUNCE_MS);
        };

        selectionHandler = (_cfiRange: string, contents: EpubContents) => {
          try {
            const selection = contents.window.getSelection();

            if (!selection || selection.rangeCount === 0) {
              return;
            }

            const extractedContext = extractContextSentenceFromSelection(selection);

            if (!extractedContext.selectedText) {
              return;
            }

            selectedContentsRef.current = contents;
            setSelectedText(extractedContext.selectedText);
            setContextSentence(extractedContext.contextSentence);
          } catch {
            // Ignore selection extraction errors and keep reader responsive.
          }
        };

        relocatedHandler = (location: unknown) => {
          const relocatedPayload = location as RelocatedPayload;
          const startCfi = getRelocatedStartCfi(relocatedPayload);
          const endCfi = getRelocatedEndCfi(relocatedPayload);
          const currentLocationCfi = startCfi ?? endCfi;
          const fallbackProgressPercentage = getRelocatedFallbackProgress(relocatedPayload);

          if (!currentLocationCfi || isCancelled) {
            return;
          }

          // Use end CFI for progress when available because it changes more often in paginated flow.
          saveProgressForCfi(
            currentLocationCfi,
            endCfi ?? currentLocationCfi,
            fallbackProgressPercentage,
          );
        };

        rendition.on("selected", selectionHandler);
        rendition.on("relocated", relocatedHandler);

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

            if (locationsReadyRef.current) {
              const currentCfi = getCurrentRenditionCfi(renditionRef.current);

              if (currentCfi) {
                saveProgressForCfi(currentCfi, currentCfi);
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

          const nextWidth = renderContainer.clientWidth;
          const nextHeight = renderContainer.clientHeight;

          if (nextWidth > 0 && nextHeight > 0) {
            try {
              activeRendition.resize(nextWidth, nextHeight);
            } catch {
              // Ignore transient resize race conditions while epub.js is settling.
            }
          }
        };

        resizeRendition = handleResize;

        if (initialLocation) {
          try {
            await rendition.display(initialLocation);
          } catch {
            await rendition.display();
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
          setErrorMessage("Could not load this EPUB file right now. Please try again from Library.");
          setIsLoading(false);
          setIsReady(false);
        }
      }
    }

    void mountReader();

    return () => {
      isCancelled = true;
      abortController.abort();
      isRenditionReadyRef.current = false;
      locationsReadyRef.current = false;
      if (resizeRendition) {
        window.removeEventListener("resize", resizeRendition);
      }
      resizeObserver?.disconnect();
      if (saveProgressTimerRef.current) {
        clearTimeout(saveProgressTimerRef.current);
        saveProgressTimerRef.current = null;
      }
      if (selectionHandler && renditionRef.current) {
        renditionRef.current.off("selected", selectionHandler);
      }
      if (relocatedHandler && renditionRef.current) {
        renditionRef.current.off("relocated", relocatedHandler);
      }
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      renderContainer.innerHTML = "";
    };
  }, [fileUrl, bookId, initialLocation]);

  const goToPreviousPage = useCallback(async () => {
    if (!renditionRef.current) {
      return;
    }

    try {
      clearSelection();
      await renditionRef.current.prev();
    } catch {
      setErrorMessage("Could not navigate to the previous page.");
    }
  }, [clearSelection]);

  const goToNextPage = useCallback(async () => {
    if (!renditionRef.current) {
      return;
    }

    try {
      clearSelection();
      await renditionRef.current.next();
    } catch {
      setErrorMessage("Could not navigate to the next page.");
    }
  }, [clearSelection]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
        <Button variant="secondary" size="sm" onClick={goToPreviousPage} disabled={!isReady}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={goToNextPage} disabled={!isReady}>
          Next
        </Button>
      </div>

      <div
        className="relative flex-1 min-h-0 overflow-hidden"
      >
        <div ref={containerRef} className="h-full w-full min-h-0 overflow-hidden bg-white" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-4">
            <p className="text-sm text-slate-600">Loading reader...</p>
          </div>
        )}

        {errorMessage && (
          <div className="absolute left-3 right-3 top-3">
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          </div>
        )}

        {selectedText && (
          <>
            <div className="absolute bottom-3 right-3 z-30 hidden w-full max-w-md md:block">
              <SelectionPanel
                bookId={bookId}
                selectedText={selectedText}
                contextSentence={contextSentence}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                onClear={clearSelection}
              />
            </div>

            <div className="fixed inset-x-3 bottom-20 z-50 md:hidden">
              <SelectionPanel
                bookId={bookId}
                selectedText={selectedText}
                contextSentence={contextSentence}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                onClear={clearSelection}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
