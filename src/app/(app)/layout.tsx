import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getRequestUser } from "@/lib/auth";
import { getUserCredits } from "@/lib/credits";
import { getUserOnboarding } from "@/lib/onboarding";

type PrivateAppLayoutProps = {
  children: ReactNode;
};

export default async function PrivateAppLayout({ children }: PrivateAppLayoutProps) {
  const { user } = await getRequestUser();

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
