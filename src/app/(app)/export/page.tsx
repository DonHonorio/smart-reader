import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function ExportPage() {
  return (
    <PlaceholderPage
      label="App"
      title="Export"
      description="Placeholder page for Anki-friendly CSV export with a simple and focused workflow."
      links={[
        { href: ROUTES.vocabulary, label: "Back to vocabulary" },
        { href: ROUTES.dashboard, label: "Back to dashboard" },
      ]}
    />
  );
}
