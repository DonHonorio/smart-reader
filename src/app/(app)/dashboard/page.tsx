import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function DashboardPage() {
  return (
    <PlaceholderPage
      label="App"
      title="Dashboard"
      description="Placeholder dashboard for the private area. Use this as the central entry point for reader workflows."
      links={[
        { href: ROUTES.library, label: "Open library" },
        { href: ROUTES.reader("sample-book"), label: "Open sample reader" },
        { href: ROUTES.vocabulary, label: "Review vocabulary" },
        { href: ROUTES.export, label: "Export cards" },
      ]}
    />
  );
}
