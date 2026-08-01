import { NextResponse } from "next/server";
import {
  BOOK_ACCESS_SIGNED_URL_TTL_SECONDS,
  buildBookAccessErrorResponse,
  classifySupabaseStorageError,
  getBookAccessHttpStatus,
  isReadableBookStatus,
  logBookAccessEvent,
} from "@/lib/bookAccess";
import { BOOKS_BUCKET } from "@/lib/books";
import { createClient } from "@/lib/supabase/server";
import type { BookAccessErrorCode, BookAccessGrant } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function accessError(code: BookAccessErrorCode, status = getBookAccessHttpStatus(code)) {
  return NextResponse.json(buildBookAccessErrorResponse(code), {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Returns a brand new signed URL for the EPUB of a book owned by the caller.
 * The client sends only the bookId: `file_path` is always read from the database,
 * never accepted from the request, and the signed URL is never persisted.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookId = (url.searchParams.get("bookId") ?? "").trim();

  if (!bookId) {
    return accessError("BOOK_NOT_FOUND", 400);
  }

  try {
    const supabase = await createClient();
    // Cliente aparte solo para la lectura: sobre el mismo cliente, la consulta espera al
    // cerrojo interno del token de supabase-js y las dos llamadas acaban sumandose
    // (170 ms) en vez de solaparse (85 ms). La consulta sigue pasando por RLS y la
    // propiedad se comprueba explicitamente en cuanto ambas resuelven.
    const readClient = await createClient();

    const [authResult, bookResult] = await Promise.all([
      supabase.auth.getUser(),
      readClient.from("books").select("id, user_id, status, file_path").eq("id", bookId).maybeSingle(),
    ]);

    const { data: { user }, error: authError } = authResult;
    const { data: book, error: bookError } = bookResult;

    if (authError || !user) {
      return accessError("UNAUTHENTICATED");
    }

    if (bookError) {
      console.error("/api/books/access book query error:", bookError.message);
      return accessError("UNKNOWN_ERROR");
    }

    if (!book) {
      return accessError("BOOK_NOT_FOUND");
    }

    // Row Level Security already scopes the query, but ownership stays an explicit check.
    if (book.user_id !== user.id) {
      return accessError("BOOK_NOT_OWNED");
    }

    if (!isReadableBookStatus(book.status)) {
      return accessError("BOOK_NOT_READY");
    }

    const filePath = typeof book.file_path === "string" ? book.file_path.trim() : "";

    if (!filePath) {
      return accessError("FILE_PATH_MISSING");
    }

    logBookAccessEvent("REQUESTING_SIGNED_URL", { bookId });

    const { data: signedData, error: signedUrlError } = await supabase.storage
      .from(BOOKS_BUCKET)
      .createSignedUrl(filePath, BOOK_ACCESS_SIGNED_URL_TTL_SECONDS);

    if (signedUrlError || !signedData?.signedUrl) {
      const code = signedUrlError
        ? classifySupabaseStorageError(signedUrlError.message)
        : "SIGNED_URL_FAILED";

      if (code === "STORAGE_FILE_NOT_FOUND") {
        logBookAccessEvent("STORAGE_FILE_NOT_FOUND", { bookId });
      } else {
        console.error("/api/books/access signed URL error:", signedUrlError?.message);
      }

      return accessError(code);
    }

    logBookAccessEvent("SIGNED_URL_CREATED", {
      bookId,
      expiresInSeconds: BOOK_ACCESS_SIGNED_URL_TTL_SECONDS,
    });

    const grant: BookAccessGrant = {
      bookId,
      signedUrl: signedData.signedUrl,
      expiresInSeconds: BOOK_ACCESS_SIGNED_URL_TTL_SECONDS,
      expiresAt: new Date(
        Date.now() + BOOK_ACCESS_SIGNED_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    };

    return NextResponse.json(grant, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("/api/books/access unexpected error:", error);
    return accessError("UNKNOWN_ERROR");
  }
}
