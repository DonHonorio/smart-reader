import type { ReactNode } from "react";
import { AuthShell } from "@/components/layout/AuthShell";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <AuthShell>{children}</AuthShell>;
}
