"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  uploadBookAction,
  type UploadBookActionState,
} from "@/app/(app)/library/actions";

const initialUploadBookActionState: UploadBookActionState = {
  error: null,
};

export function UploadBookForm() {
  const [state, formAction, isPending] = useActionState(
    uploadBookAction,
    initialUploadBookActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium text-slate-700">
          Title
        </label>
        <Input id="title" name="title" placeholder="Book title" required />
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
        <Input id="file" name="file" type="file" accept=".epub,application/epub+zip" required />
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload EPUB"}
      </Button>
    </form>
  );
}
