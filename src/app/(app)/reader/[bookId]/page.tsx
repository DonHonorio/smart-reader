import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

type ReaderBookPageProps = {
  params: Promise<{
    bookId: string;
  }>;
};

export default async function ReaderBookPage({ params }: ReaderBookPageProps) {
  const { bookId } = await params;

  return (
    <PlaceholderPage
      label="Reader"
      title={`Reading session: ${bookId}`}
      description="Placeholder reader screen. EPUB rendering, contextual translation, and vocabulary capture will be added next."
      links={[
        { href: ROUTES.library, label: "Back to library" },
        { href: ROUTES.vocabulary, label: "Saved vocabulary" },
      ]}
    >
      <Card
        title="Context lookup"
        description="Quick placeholder for contextual translation and vocabulary capture."
        className="bg-slate-50"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input aria-label="Lookup term" placeholder="Type a word or phrase" />
          <Button className="sm:min-w-28">Translate</Button>
        </div>
      </Card>
    </PlaceholderPage>
  );
}
