import { redirect } from "next/navigation";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { APP_TAGLINE, APP_TITLE, ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export default async function MarketingHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(ROUTES.dashboard);
  }

  return (
    <PlaceholderPage
      label="Marketing"
      title={APP_TITLE}
      description={`${APP_TAGLINE} This public landing is the initial SaaS shell for Smart-Reader.`}
      links={[
        { href: ROUTES.login, label: "Login" },
        { href: ROUTES.register, label: "Register" },
        { href: ROUTES.dashboard, label: "Go to dashboard" },
      ]}
    />
  );
}
