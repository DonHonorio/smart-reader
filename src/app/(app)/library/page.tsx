import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function LibraryPage() {
  return (
    <PlaceholderPage
      label="App"
      title="Library"
      description="Placeholder page for uploaded books and reading progress. EPUB upload logic will be added later."
      links={[
        { href: ROUTES.reader("sample-book"), label: "Open sample reader" },
        { href: ROUTES.dashboard, label: "Back to dashboard" },
      ]}
    />
  );
}
