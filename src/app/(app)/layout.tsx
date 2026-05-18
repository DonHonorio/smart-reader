import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getUserCredits } from "@/lib/credits";
import { getUserOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

type PrivateAppLayoutProps = {
  children: ReactNode;
};

export default async function PrivateAppLayout({ children }: PrivateAppLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [creditsBalance, onboarding] = await Promise.all([
    getUserCredits(),
    getUserOnboarding(),
  ]);

  return (
    <AppShell creditsBalance={creditsBalance} initialOnboarding={onboarding}>
      {children}
    </AppShell>
  );
}
