import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type EmptyLibraryStateProps = {
  uploadHref?: string;
};

export function EmptyLibraryState({ uploadHref = "#upload-book-panel" }: EmptyLibraryStateProps) {
  return (
    <Card
      className="text-center"
      title="No books yet"
      description="Upload your first EPUB to start building Anki-ready vocabulary."
    >
      <div className="flex justify-center">
        <Link href={uploadHref} className={buttonClassNames({ variant: "secondary" })}>
          Upload book
        </Link>
      </div>
    </Card>
  );
}
