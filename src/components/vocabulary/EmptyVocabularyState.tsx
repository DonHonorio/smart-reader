import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonClassNames } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants";

export function EmptyVocabularyState() {
  return (
    <Card
      className="text-center"
      title="No vocabulary saved yet"
      description="Select text while reading and save translations to build a searchable, Anki-ready deck."
    >
      <div className="flex justify-center">
        <Link href={ROUTES.library} className={buttonClassNames({ variant: "secondary" })}>
          Go to Library
        </Link>
      </div>
    </Card>
  );
}