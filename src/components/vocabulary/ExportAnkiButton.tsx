"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

const EXPORT_GENERIC_ERROR = "Could not export vocabulary right now. Please try again.";

export function ExportAnkiButton() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/export/anki", {
        method: "GET",
      });

      if (!response.ok) {
        let serverError = EXPORT_GENERIC_ERROR;

        try {
          const data = (await response.json()) as { error?: string };
          if (typeof data.error === "string" && data.error.trim()) {
            serverError = data.error;
          }
        } catch {
          serverError = EXPORT_GENERIC_ERROR;
        }

        setErrorMessage(serverError);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smart-reader-vocabulary.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      window.dispatchEvent(new Event("onboarding-export-clicked"));
    } catch {
      setErrorMessage(EXPORT_GENERIC_ERROR);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        id="export-anki-button"
        variant="secondary"
        onClick={handleClick}
        disabled={isDownloading}
        className="cursor-pointer"
      >
        Download Anki CSV
      </Button>
      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
    </div>
  );
}