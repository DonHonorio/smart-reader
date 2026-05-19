import Link from "next/link";
import { ExportAnkiButton } from "@/components/vocabulary/ExportAnkiButton";
import { Card } from "@/components/ui/Card";
import { buttonClassNames } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants";
import { getUserVocabularyItems } from "@/lib/vocabulary";

export default async function ExportPage() {
  const hasVocabulary = (await getUserVocabularyItems({ limit: 1 })).length > 0;

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Export</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Download your saved vocabulary as a CSV file ready for manual import in Anki.
        </p>
      </header>

      {hasVocabulary ? (
        <Card
          title="Anki CSV export"
          description="This export includes your term, translation, context, and metadata needed for review cards."
        >
          <div className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Front</li>
              <li>Back</li>
              <li>Context</li>
              <li>Selected Text</li>
              <li>Unit Type</li>
              <li>Confidence</li>
              <li>Created At</li>
            </ul>

            <ExportAnkiButton />

            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Import this CSV into Anki using Front and Back as the main card fields.
            </p>
          </div>
        </Card>
      ) : (
        <Card
          title="No vocabulary to export yet"
          description="Save a few words or phrases while reading, then return here to download your Anki CSV."
          className="text-center"
        >
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={ROUTES.library} className={buttonClassNames({ variant: "secondary", size: "sm" })}>
              Go to library
            </Link>
            <Link href={ROUTES.vocabulary} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
              Open vocabulary
            </Link>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href={ROUTES.vocabulary} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
          Back to vocabulary
        </Link>
        <Link href={ROUTES.dashboard} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
