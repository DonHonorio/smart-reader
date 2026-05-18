import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { VocabularyItem } from "@/types";

const EXPORT_COLUMNS = [
  "Front",
  "Back",
  "Context",
  "Selected Text",
  "Unit Type",
  "Confidence",
  "Created At",
] as const;

type ExportVocabularyItem = Pick<
  VocabularyItem,
  | "selected_text"
  | "term"
  | "canonical_unit"
  | "translation"
  | "context_sentence"
  | "unit_type"
  | "confidence"
  | "created_at"
>;

function normalizeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function escapeCsvField(value: unknown) {
  const normalized = normalizeCsvValue(value);

  if (!/[",\r\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

function toCsvRow(values: unknown[]) {
  return values.map((value) => escapeCsvField(value)).join(",");
}

function toFrontValue(item: ExportVocabularyItem) {
  const canonicalUnit = normalizeCsvValue(item.canonical_unit).trim();

  if (canonicalUnit) {
    return canonicalUnit;
  }

  return normalizeCsvValue(item.term);
}

function buildCsv(items: ExportVocabularyItem[]) {
  const lines: string[] = items.length === 0 ? [toCsvRow([...EXPORT_COLUMNS])] : [];

  for (const item of items) {
    lines.push(
      toCsvRow([
        toFrontValue(item),
        item.translation,
        item.context_sentence,
        item.selected_text,
        item.unit_type,
        item.confidence,
        item.created_at,
      ]),
    );
  }

  return lines.join("\r\n");
}

function getExportFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `smart-reader-anki-export-${date}.csv`;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("vocabulary_items")
      .select(
        "selected_text, term, canonical_unit, translation, context_sentence, unit_type, confidence, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("/api/export/anki query error:", error.message);
      return NextResponse.json({ error: "Could not export vocabulary right now." }, { status: 500 });
    }

    const csv = buildCsv((data ?? []) as ExportVocabularyItem[]);
    const fileName = getExportFileName();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("/api/export/anki unexpected error:", error);
    return NextResponse.json({ error: "Could not export vocabulary right now." }, { status: 500 });
  }
}

// Backward compatibility: some clients still call POST for export.
export async function POST() {
  return GET();
}