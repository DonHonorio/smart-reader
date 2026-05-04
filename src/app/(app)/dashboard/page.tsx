import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function DashboardPage() {
  return (
    <PlaceholderPage
      label="App"
      title="Dashboard"
      description="Central workspace placeholder for reading workflows, vocabulary capture, and export flow."
      links={[
        { href: ROUTES.library, label: "Open library" },
        { href: ROUTES.reader("sample-book"), label: "Open sample reader" },
        { href: ROUTES.vocabulary, label: "Review vocabulary" },
        { href: ROUTES.export, label: "Export cards" },
      ]}
    />
  );
}
