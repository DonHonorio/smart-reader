"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  uploadBookAction,
  type UploadBookActionState,
} from "@/app/(app)/library/actions";

const MAX_EPUB_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const MAX_SUGGESTED_TITLE_LENGTH = 120;
const FILE_TOO_LARGE_ERROR = "The EPUB file is too large. Maximum size is 25 MB.";
const TITLE_TOO_LONG_ERROR = "Title is too long. Maximum length is 160 characters.";
const UNEXPECTED_UPLOAD_ERROR =
  "Could not upload this file. If it is stored in Google Drive or another cloud provider, download it to your device first and try again.";

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

export function UploadBookForm() {
  const router = useRouter();
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isUploading) {
      return;
    }

    const titleInput = event.currentTarget.elements.namedItem("title");
    const fileInput = event.currentTarget.elements.namedItem("file");

    if (!(titleInput instanceof HTMLInputElement) || !(fileInput instanceof HTMLInputElement)) {
      return;
    }

    const validationError = getClientValidationError(titleInput.value, fileInput.files?.[0]);

    if (validationError) {
      setClientError(validationError);
      setServerError(null);
      return;
    }

    setClientError(null);
    setServerError(null);
    setIsUploading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await uploadBookAction(initialUploadBookActionState, formData);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      event.currentTarget.reset();
      setTitle("");
      router.refresh();
    } catch (error) {
      console.error("UploadBookForm unexpected upload error:", error);
      setServerError(UNEXPECTED_UPLOAD_ERROR);
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
    setClientError(getClientValidationError(nextTitle, file));
    setServerError(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const shouldSuggestTitle = !title.trim();
    const suggestedTitle = shouldSuggestTitle && file ? getSuggestedTitleFromFileName(file.name) : title;
    const nextTitle = shouldSuggestTitle ? suggestedTitle : title;

    if (shouldSuggestTitle && suggestedTitle) {
      setTitle(suggestedTitle);
    }

    setClientError(getClientValidationError(nextTitle, file));
    setServerError(null);
  }

  const errorMessage = clientError ?? serverError;

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

      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={isUploading || Boolean(clientError)}>
        {isUploading ? "Uploading..." : "Upload EPUB"}
      </Button>
    </form>
  );
}
