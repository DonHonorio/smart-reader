/**
 * Recuperacion del lector al volver desde segundo plano.
 *
 * La comprobacion de salud es deliberadamente barata: solo lee el DOM y la API publica
 * de epub.js. Nunca llama a Supabase, a Storage ni a la IA, no cambia de pagina, no
 * guarda progreso y no genera locations.
 */

export type ReaderRecoveryReason =
  | "visibilitychange"
  | "pageshow"
  | "bfcache"
  | "focus"
  | "online";

export type ReaderHealthStatus = "healthy" | "broken";

export type ReaderHealthReason =
  | "ok"
  | "not_ready"
  | "no_instance"
  | "no_container"
  | "no_frame"
  | "frame_detached"
  | "empty_document";

export type ReaderHealthResult = {
  status: ReaderHealthStatus;
  reason: ReaderHealthReason;
};

/**
 * Limitacion conocida: `rendition.currentLocation()` de epub.js no sirve como prueba de
 * vida, porque puede devolver una promesa pendiente en un lector perfectamente sano y
 * daria falsos rotos. El veredicto se apoya solo en lo observable del DOM, que es
 * ademas el sintoma real de una pestaña suspendida: el iframe pierde su documento o
 * se queda vacio. Un rendition muerto con el DOM intacto no se detectaria, pero ese
 * caso no se ha observado: si el navegador descarta el heap, la ruta se recarga entera.
 */
type ReaderHealthInput = {
  /** El lector solo se considera evaluable cuando termino de cargar. */
  isReady: boolean;
  hasBook: boolean;
  hasRendition: boolean;
  container: HTMLElement | null;
};

type ReaderRecoveryLogEvent =
  | "BACKGROUND_ENTERED"
  | "FOREGROUND_ENTERED"
  | "HEALTH_CHECK_STARTED"
  | "HEALTHY"
  | "RECOVERY_REQUIRED"
  | "RECOVERY_STARTED"
  | "RECOVERY_SUCCEEDED"
  | "RECOVERY_FAILED"
  | "DUPLICATE_EVENT_IGNORED"
  | "OFFLINE_RECOVERY_DEFERRED"
  | "BFCACHE_RESTORED";

/** Ventana en la que varias señales del navegador cuentan como el mismo regreso. */
export const RECOVERY_DUPLICATE_EVENT_WINDOW_MS = 700;

/** Segunda lectura antes de dar por rota la instancia, para no reconstruir por un falso positivo. */
export const RECOVERY_CONFIRMATION_DELAY_MS = 250;

/**
 * Breadcrumb de desarrollo. Nunca registra signed URLs, tokens, cookies, claves ni
 * contenido del libro: solo bookId, motivo, identificador y duraciones.
 */
export function logReaderRecoveryEvent(
  event: ReaderRecoveryLogEvent,
  details?: Record<string, string | number | boolean | null>,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.debug(`[reader-recovery] ${event}`, details);
    return;
  }

  console.debug(`[reader-recovery] ${event}`);
}

/**
 * Un iframe suspendido por el navegador conserva el nodo pero pierde el documento o lo
 * deja vacio. Ese es el sintoma tipico en movil, y es observable sin tocar internals.
 */
function hasLiveRenderedDocument(container: HTMLElement) {
  const frames = container.querySelectorAll("iframe");

  if (frames.length === 0) {
    return { ok: false, reason: "no_frame" as const };
  }

  for (const frame of frames) {
    let frameDocument: Document | null = null;

    try {
      frameDocument = frame.contentDocument;
    } catch {
      // Un documento inaccesible cuenta como instancia perdida.
      return { ok: false, reason: "frame_detached" as const };
    }

    if (!frameDocument) {
      return { ok: false, reason: "frame_detached" as const };
    }

    const body = frameDocument.body;

    if (!body || body.childElementCount === 0) {
      return { ok: false, reason: "empty_document" as const };
    }
  }

  return { ok: true, reason: "ok" as const };
}

export function evaluateReaderHealth(input: ReaderHealthInput): ReaderHealthResult {
  if (!input.isReady) {
    return { status: "healthy", reason: "not_ready" };
  }

  if (!input.hasBook || !input.hasRendition) {
    return { status: "broken", reason: "no_instance" };
  }

  if (!input.container) {
    return { status: "broken", reason: "no_container" };
  }

  const renderedDocument = hasLiveRenderedDocument(input.container);

  if (!renderedDocument.ok) {
    return { status: "broken", reason: renderedDocument.reason };
  }

  return { status: "healthy", reason: "ok" };
}

/** Codigos de la Fase 36.1 que una vuelta de conexion puede resolver. */
const NETWORK_RECOVERABLE_ERROR_CODES = new Set(["NETWORK_ERROR", "EPUB_LOAD_TIMEOUT"]);

export function isNetworkRecoverableErrorCode(code: string | null) {
  return code !== null && NETWORK_RECOVERABLE_ERROR_CODES.has(code);
}
