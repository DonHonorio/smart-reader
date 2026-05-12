"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClassNames } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  uploadBookAction,
  type UploadBookActionState,
} from "@/app/(app)/library/actions";
import { ROUTES } from "@/lib/constants";

const MAX_EPUB_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const MAX_SUGGESTED_TITLE_LENGTH = 120;
const FILE_TOO_LARGE_ERROR = "The EPUB file is too large. Maximum size is 25 MB.";
const TITLE_TOO_LONG_ERROR = "Title is too long. Maximum length is 160 characters.";
const UNEXPECTED_UPLOAD_ERROR =
  "Could not upload this file. If it is stored in Google Drive or another cloud provider, download it to your device first and try again.";
const INSUFFICIENT_CREDITS_FORM_ERROR = "You need 1 credit to upload a book.";

const initialUploadBookActionState: UploadBookActionState = {
  error: null,
};

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
  return getTitleLengthError(title) ?? getFileSizeError(file);
}

type UploadBookFormProps = {
  creditsBalance: number;
};

export function UploadBookForm({ creditsBalance }: UploadBookFormProps) {
  const router = useRouter();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState("");
  const normalizedCredits = Math.max(0, creditsBalance);
  const hasCredits = normalizedCredits > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (isUploading) {
      return;
    }

    if (!hasCredits) {
      setUploadError(null);
      setUploadSuccess(null);
      return;
    }

    const titleInput = form.elements.namedItem("title");
    const fileInput = form.elements.namedItem("file");

    if (!(titleInput instanceof HTMLInputElement) || !(fileInput instanceof HTMLInputElement)) {
      return;
    }

    const nextValidationError = getClientValidationError(titleInput.value, fileInput.files?.[0]);

    if (nextValidationError) {
      setValidationError(nextValidationError);
      setUploadError(null);
      setUploadSuccess(null);
      return;
    }

    setValidationError(null);
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);

    try {
      const formData = new FormData(form);
      const result = await uploadBookAction(initialUploadBookActionState, formData);

      if (result.error) {
        setUploadError(result.error);
        setUploadSuccess(null);
        return;
      }

      form.reset();
      setTitle("");
      setValidationError(null);
      setUploadError(null);
      setUploadSuccess("Book uploaded successfully. 1 credit was used.");
      router.refresh();
    } catch (error) {
      console.error("UploadBookForm unexpected upload error:", error);
      setUploadSuccess(null);
      setUploadError(UNEXPECTED_UPLOAD_ERROR);
    } finally {
      setIsUploading(false);
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
        disabled={!hasCredits || isUploading || Boolean(validationError)}
      >
        {isUploading ? "Uploading..." : "Upload EPUB"}
      </Button>
    </form>
  );
}
