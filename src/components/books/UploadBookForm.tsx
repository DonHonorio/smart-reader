"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClassNames } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ROUTES } from "@/lib/constants";
import { INVALID_EPUB_FILE_ERROR, validateEpubFile } from "@/lib/epubValidation";
import { createClient } from "@/lib/supabase/client";
import type {
  CancelBookUploadRequest,
  CompleteBookUploadResponse,
  CreateBookUploadResponse,
} from "@/types";

const MAX_EPUB_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const MAX_SUGGESTED_TITLE_LENGTH = 120;
const FILE_TOO_LARGE_ERROR = "The EPUB file is too large. Maximum size is 25 MB.";
const FILE_TYPE_ERROR = "Only EPUB files are supported.";
const TITLE_TOO_LONG_ERROR = "Title is too long. Maximum length is 160 characters.";
const UNEXPECTED_UPLOAD_ERROR = "Could not upload this file. Please try again.";
const INSUFFICIENT_CREDITS_FORM_ERROR = "You need 1 credit to upload a book.";

type CreateUploadSuccessPayload = Extract<CreateBookUploadResponse, { bookId: string }>;
type CompleteUploadSuccessPayload = Extract<CompleteBookUploadResponse, { success: true }>;

function isCreateUploadSuccessPayload(
  payload: CreateBookUploadResponse | null,
): payload is CreateUploadSuccessPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "bookId" in payload &&
      typeof payload.bookId === "string" &&
      "path" in payload &&
      typeof payload.path === "string" &&
      "token" in payload &&
      typeof payload.token === "string",
  );
}

function isCompleteUploadSuccessPayload(
  payload: CompleteBookUploadResponse | null,
): payload is CompleteUploadSuccessPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "success" in payload &&
      payload.success === true,
  );
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return UNEXPECTED_UPLOAD_ERROR;
  }

  const maybeError = (payload as { error?: unknown }).error;

  if (typeof maybeError !== "string") {
    return UNEXPECTED_UPLOAD_ERROR;
  }

  const normalizedError = maybeError.trim();
  return normalizedError || UNEXPECTED_UPLOAD_ERROR;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function isSupportedEpubFile(file: File | null | undefined) {
  if (!file) {
    return false;
  }

  return file.name.trim().toLowerCase().endsWith(".epub");
}

function getFileTypeError(file: File | null | undefined) {
  if (!file) {
    return null;
  }

  if (!isSupportedEpubFile(file)) {
    return FILE_TYPE_ERROR;
  }

  return null;
}

function getFileSizeError(file: File | null | undefined) {
  if (!file) {
    return null;
  }

  if (file.size > MAX_EPUB_SIZE_BYTES) {
    return FILE_TOO_LARGE_ERROR;
  }

  return null;
}

function getTitleLengthError(title: string) {
  if (title.trim().length > MAX_TITLE_LENGTH) {
    return TITLE_TOO_LONG_ERROR;
  }

  return null;
}

function getSuggestedTitleFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.epub$/i, "");
  const normalized = withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  return normalized.slice(0, MAX_SUGGESTED_TITLE_LENGTH).trim();
}

function getClientValidationError(title: string, file: File | null | undefined) {
  return getTitleLengthError(title) ?? getFileTypeError(file) ?? getFileSizeError(file);
}

async function requestCancelUpload(payload: CancelBookUploadRequest) {
  try {
    await fetch("/api/books/cancel-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best effort cleanup to avoid orphan books/uploads.
  }
}

type UploadBookFormProps = {
  creditsBalance: number;
};

type UploadStatus = "idle" | "validating" | "uploading";

export function UploadBookForm({ creditsBalance }: UploadBookFormProps) {
  const router = useRouter();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [title, setTitle] = useState("");
  const normalizedCredits = Math.max(0, creditsBalance);
  const hasCredits = normalizedCredits > 0;
  const isBusy = uploadStatus !== "idle";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (isBusy) {
      return;
    }

    if (!hasCredits) {
      setUploadError(INSUFFICIENT_CREDITS_FORM_ERROR);
      setUploadSuccess(null);
      return;
    }

    const titleInput = form.elements.namedItem("title");
    const authorInput = form.elements.namedItem("author");
    const languageFromInput = form.elements.namedItem("language_from");
    const languageToInput = form.elements.namedItem("language_to");
    const fileInput = form.elements.namedItem("file");

    if (
      !(titleInput instanceof HTMLInputElement) ||
      !(authorInput instanceof HTMLInputElement) ||
      !(languageFromInput instanceof HTMLInputElement) ||
      !(languageToInput instanceof HTMLInputElement) ||
      !(fileInput instanceof HTMLInputElement)
    ) {
      return;
    }

    const selectedFile = fileInput.files?.[0] ?? null;

    if (!selectedFile) {
      setValidationError(FILE_TYPE_ERROR);
      setUploadError(null);
      setUploadSuccess(null);
      return;
    }

    const nextValidationError = getClientValidationError(titleInput.value, selectedFile);

    if (nextValidationError) {
      setValidationError(nextValidationError);
      setUploadError(null);
      setUploadSuccess(null);
      return;
    }

    setValidationError(null);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadStatus("validating");

    try {
      const epubValidation = await validateEpubFile(selectedFile);

      if (!epubValidation.valid) {
        setValidationError(epubValidation.error ?? INVALID_EPUB_FILE_ERROR);
        return;
      }

      setUploadStatus("uploading");

      const createUploadResponse = await fetch("/api/books/create-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: titleInput.value,
          author: authorInput.value,
          language_from: languageFromInput.value,
          language_to: languageToInput.value,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
        }),
      });

      const createUploadPayload = await parseJsonResponse<CreateBookUploadResponse>(
        createUploadResponse,
      );

      if (!createUploadResponse.ok || !isCreateUploadSuccessPayload(createUploadPayload)) {
        throw new Error(getApiErrorMessage(createUploadPayload));
      }

      const pendingUpload = {
        bookId: createUploadPayload.bookId,
        filePath: createUploadPayload.path,
      };

      const supabase = createClient();
      const { error: signedUploadError } = await supabase.storage
        .from("books")
        .uploadToSignedUrl(createUploadPayload.path, createUploadPayload.token, selectedFile, {
          contentType: selectedFile.type || "application/epub+zip",
        });

      if (signedUploadError) {
        await requestCancelUpload({
          bookId: pendingUpload.bookId,
          filePath: pendingUpload.filePath,
        });

        throw new Error(UNEXPECTED_UPLOAD_ERROR);
      }

      const completeUploadResponse = await fetch("/api/books/complete-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookId: pendingUpload.bookId,
          filePath: pendingUpload.filePath,
        }),
      });

      const completeUploadPayload = await parseJsonResponse<CompleteBookUploadResponse>(
        completeUploadResponse,
      );

      if (!completeUploadResponse.ok || !isCompleteUploadSuccessPayload(completeUploadPayload)) {
        await requestCancelUpload({
          bookId: pendingUpload.bookId,
          filePath: pendingUpload.filePath,
        });

        throw new Error(getApiErrorMessage(completeUploadPayload));
      }

      form.reset();
      setTitle("");
      setValidationError(null);
      setUploadError(null);
      setUploadSuccess("Book uploaded successfully. 1 credit was used.");
      router.refresh();
    } catch (error) {
      console.error("UploadBookForm upload flow error:", error);
      setUploadSuccess(null);
      setUploadError(error instanceof Error && error.message ? error.message : UNEXPECTED_UPLOAD_ERROR);
    } finally {
      setUploadStatus("idle");
    }
  }

  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextTitle = event.target.value;
    const form = event.target.form;
    const fileInput = form?.elements.namedItem("file");
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;

    setTitle(nextTitle);
    setValidationError(getClientValidationError(nextTitle, file));
    setUploadError(null);
    setUploadSuccess(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const shouldSuggestTitle = !title.trim();
    const suggestedTitle = shouldSuggestTitle && file ? getSuggestedTitleFromFileName(file.name) : title;
    const nextTitle = shouldSuggestTitle ? suggestedTitle : title;

    if (shouldSuggestTitle && suggestedTitle) {
      setTitle(suggestedTitle);
    }

    setValidationError(getClientValidationError(nextTitle, file));
    setUploadError(null);
    setUploadSuccess(null);
  }

  const errorMessage = validationError ?? uploadError;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium text-slate-700">
          Title
        </label>
        <Input
          id="title"
          name="title"
          placeholder="Book title"
          value={title}
          onChange={handleTitleChange}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="author" className="text-sm font-medium text-slate-700">
          Author (optional)
        </label>
        <Input id="author" name="author" placeholder="Author name" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="language_from" className="text-sm font-medium text-slate-700">
            Source language
          </label>
          <Input id="language_from" name="language_from" defaultValue="en" required />
        </div>
        <div className="space-y-2">
          <label htmlFor="language_to" className="text-sm font-medium text-slate-700">
            Target language
          </label>
          <Input id="language_to" name="language_to" defaultValue="es" required />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="file" className="text-sm font-medium text-slate-700">
          EPUB file
        </label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".epub,application/epub+zip"
          onChange={handleFileChange}
          required
        />
        <p className="text-xs text-slate-500 lg:hidden">
          On mobile, if your EPUB is stored in Google Drive or another cloud app, download it to
          your device first before uploading.
        </p>
      </div>

      {!hasCredits && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <p>{INSUFFICIENT_CREDITS_FORM_ERROR}</p>
          <Link
            href={ROUTES.billing}
            className={buttonClassNames({ variant: "secondary", size: "sm", className: "mt-3" })}
          >
            Buy credits
          </Link>
        </div>
      )}

      {uploadSuccess && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {uploadSuccess}
        </p>
      )}

      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        variant="secondary"
        disabled={!hasCredits || isBusy || Boolean(validationError)}
      >
        {uploadStatus === "validating"
          ? "Validating EPUB..."
          : uploadStatus === "uploading"
            ? "Uploading..."
            : "Upload EPUB"}
      </Button>
    </form>
  );
}
