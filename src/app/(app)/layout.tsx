import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

type PrivateAppLayoutProps = {
  children: ReactNode;
};

export default function PrivateAppLayout({ children }: PrivateAppLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
