import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { ROUTES } from "@/lib/constants";

export default function LoginPage() {
  return (
    <PlaceholderPage
      label="Auth"
      title="Login"
      description="Placeholder page for sign in. Authentication will be connected in a later step."
      links={[
        { href: ROUTES.register, label: "Create account" },
        { href: ROUTES.home, label: "Back to home" },
      ]}
    />
  );
}
