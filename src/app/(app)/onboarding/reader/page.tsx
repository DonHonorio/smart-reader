import { redirect } from "next/navigation";
import { OnboardingDemoReader } from "@/components/onboarding/OnboardingDemoReader";
import { ROUTES } from "@/lib/constants";
import { getUserOnboarding } from "@/lib/onboarding";

export default async function OnboardingReaderPage() {
  const onboarding = await getUserOnboarding();

  if (!onboarding || onboarding.status !== "pending") {
    redirect(ROUTES.dashboard);
  }

  return (
    <section className="h-full min-h-0 w-full">
      <OnboardingDemoReader className="h-full w-full" />
    </section>
  );
}
