import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function RegisterPage() {
  return (
    <PlaceholderPage
      label="Auth"
      title="Create account"
      description="Placeholder page for user registration. Authentication flow will be added later."
      links={[
        { href: ROUTES.login, label: "Already have an account" },
        { href: ROUTES.home, label: "Back to home" },
      ]}
    />
  );
}
