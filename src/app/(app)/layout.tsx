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
  // Las tres se lanzan juntas: creditos y onboarding no necesitan esperar a que la sesion
  // este verificada para empezar su consulta, y asi el layout cuesta una capa de red en
  // vez de dos. Si no hay sesion se redirige antes de renderizar nada.
  const [{ user }, creditsBalance, onboarding] = await Promise.all([
    getRequestUser(),
    getUserCredits(),
    getUserOnboarding(),
  ]);

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell creditsBalance={creditsBalance} initialOnboarding={onboarding}>
      {children}
    </AppShell>
  );
}
