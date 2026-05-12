import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getUserCredits } from "@/lib/credits";
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

  const creditsBalance = await getUserCredits();

  return <AppShell creditsBalance={creditsBalance}>{children}</AppShell>;
}
