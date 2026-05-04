import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function VocabularyPage() {
  return (
    <PlaceholderPage
      label="App"
      title="Vocabulary"
      description="Placeholder page for saved words and context sentences collected during reading sessions."
      links={[
        { href: ROUTES.export, label: "Export to CSV" },
        { href: ROUTES.dashboard, label: "Back to dashboard" },
      ]}
    />
  );
}
