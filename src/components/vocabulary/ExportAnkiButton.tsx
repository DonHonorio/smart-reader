"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ExportAnkiButton() {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleClick() {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      const response = await fetch("/api/export/anki", {
        method: "GET",
      });

      if (!response.ok) {
        alert("Export failed");
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
      alert("Export failed");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Button
      id="export-anki-button"
      variant="secondary"
      onClick={handleClick}
      disabled={isDownloading}
      className="cursor-pointer !cursor-pointer"
    >
      Download Anki CSV
    </Button>
  );
}