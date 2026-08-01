/**
 * Medicion ligera del arranque del lector, solo en development.
 *
 * Nunca registra signed URLs, tokens, claves ni contenido del libro: unicamente
 * el bookId, el nombre de la etapa y duraciones en milisegundos.
 */

export type ReaderPerformanceEvent =
  | "LOAD_STARTED"
  | "ACCESS_GRANTED"
  | "ACCESS_READY"
  | "EPUB_INSTANCE_CREATED"
  | "BOOK_READY"
  | "RENDITION_CREATED"
  | "FIRST_DISPLAY_STARTED"
  | "FIRST_PAGE_VISIBLE"
  | "PROGRESS_RESTORED"
  | "LOCATIONS_GENERATION_STARTED"
  | "LOCATIONS_GENERATION_FINISHED"
  | "TRANSLATIONS_READY";

export type ReaderPerformanceTracker = {
  mark: (event: ReaderPerformanceEvent, details?: Record<string, number | string | boolean>) => void;
  elapsed: () => number;
};

const NOOP_TRACKER: ReaderPerformanceTracker = {
  mark: () => {},
  elapsed: () => 0,
};

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function createReaderPerformanceTracker(bookId: string): ReaderPerformanceTracker {
  if (process.env.NODE_ENV === "production") {
    return NOOP_TRACKER;
  }

  const startedAt = now();
  let previousAt = startedAt;

  return {
    elapsed: () => now() - startedAt,
    mark: (event, details) => {
      const at = now();
      const stageMs = round(at - previousAt);
      const totalMs = round(at - startedAt);
      previousAt = at;

      console.debug(`[reader-performance] ${event}`, {
        bookId,
        stageMs,
        totalMs,
        ...(details ?? {}),
      });
    },
  };
}
