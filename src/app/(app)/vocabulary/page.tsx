import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function VocabularyPage() {
  return (
    <PlaceholderPage
      label="App"
      title="Vocabulary"
      description="Placeholder page for saved words and context sentences. Storage and filtering will be integrated later."
      links={[
        { href: ROUTES.export, label: "Export to CSV" },
        { href: ROUTES.dashboard, label: "Back to dashboard" },
      ]}
    />
  );
}
