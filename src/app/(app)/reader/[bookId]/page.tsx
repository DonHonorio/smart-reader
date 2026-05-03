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
    />
  );
}
