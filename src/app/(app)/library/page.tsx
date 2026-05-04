import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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
    >
      <Card
        title="Search library"
        description="Use this placeholder to preview the future filtering flow."
        className="bg-slate-50"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input aria-label="Search books" placeholder="Search by title or author" />
          <Button variant="secondary" className="sm:min-w-28">
            Search
          </Button>
        </div>
      </Card>
    </PlaceholderPage>
  );
}
