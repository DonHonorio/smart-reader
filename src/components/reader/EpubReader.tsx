"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ePub, { type Book as EpubBook, type Rendition } from "epubjs";
import { Button } from "@/components/ui/Button";
import type { EpubReaderProps } from "@/types";

export function EpubReader({ fileUrl, bookId }: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const isRenditionReadyRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();
    let resizeObserver: ResizeObserver | null = null;
    let resizeRendition: (() => void) | null = null;
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const renderContainer: HTMLDivElement = container;

    renderContainer.innerHTML = "";
    isRenditionReadyRef.current = false;
    setIsLoading(true);
    setIsReady(false);
    setErrorMessage(null);

    async function mountReader() {
      try {
        const response = await fetch(fileUrl, {
          method: "GET",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`EPUB request failed with status ${response.status}`);
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

        await rendition.display();
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
          setErrorMessage(
            "Could not load this EPUB file. Check file_path and Storage permissions.",
          );
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
      if (resizeRendition) {
        window.removeEventListener("resize", resizeRendition);
      }
      resizeObserver?.disconnect();
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      renderContainer.innerHTML = "";
    };
  }, [fileUrl, bookId]);

  const goToPreviousPage = useCallback(async () => {
    if (!renditionRef.current) {
      return;
    }

    try {
      await renditionRef.current.prev();
    } catch {
      setErrorMessage("Could not navigate to the previous page.");
    }
  }, []);

  const goToNextPage = useCallback(async () => {
    if (!renditionRef.current) {
      return;
    }

    try {
      await renditionRef.current.next();
    } catch {
      setErrorMessage("Could not navigate to the next page.");
    }
  }, []);

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
      </div>
    </section>
  );
}
