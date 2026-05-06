"use client";

import { Button } from "@/components/ui/Button";

type SelectionPanelProps = {
  selectedText: string;
  contextSentence: string | null;
  onClear: () => void;
};

export function SelectionPanel({
  selectedText,
  contextSentence,
  onClear,
}: SelectionPanelProps) {
  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected text</p>
        <p className="max-h-20 overflow-auto rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
          {selectedText}
        </p>
      </div>

      {contextSentence && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context</p>
          <p className="max-h-24 overflow-auto rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
            {contextSentence}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled>
          Translate
        </Button>
        <Button variant="secondary" size="sm" disabled>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </section>
  );
}
