import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { APP_TAGLINE, APP_TITLE, ROUTES } from "@/lib/constants";

export default function MarketingHomePage() {
  return (
    <PlaceholderPage
      label="Marketing"
      title={APP_TITLE}
      description={`${APP_TAGLINE} This is the initial landing placeholder for the MVP.`}
      links={[
        { href: ROUTES.login, label: "Login" },
        { href: ROUTES.register, label: "Create account" },
        { href: ROUTES.dashboard, label: "Go to dashboard" },
      ]}
    />
  );
}
