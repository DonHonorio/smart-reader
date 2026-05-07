"use client";

import { Button } from "@/components/ui/Button";

export function ExportAnkiButton() {
  return (
    <Button variant="secondary" onClick={() => window.location.assign("/api/export/anki")}>
      Download Anki CSV
    </Button>
  );
}