import { ROUTES } from "@/lib/constants";
import type { NavigationItem } from "@/types";

export const PRIVATE_NAVIGATION: NavigationItem[] = [
  { label: "Dashboard", href: ROUTES.dashboard },
  { label: "Library", href: ROUTES.library },
  { label: "Vocabulary", href: ROUTES.vocabulary },
  { label: "Export", href: ROUTES.export },
  { label: "Billing", href: ROUTES.billing },
];

export const MARKETING_NAVIGATION: NavigationItem[] = [
  { label: "Login", href: ROUTES.login },
  { label: "Register", href: ROUTES.register },
];

const STATIC_SECTION_NAMES: Record<string, string> = {
  [ROUTES.dashboard]: "Dashboard",
  [ROUTES.library]: "Library",
  [ROUTES.vocabulary]: "Vocabulary",
  [ROUTES.export]: "Export",
  [ROUTES.billing]: "Billing",
};

export function getAppSectionName(pathname: string) {
  if (!pathname) {
    return "Dashboard";
  }

  if (pathname.startsWith("/reader/")) {
    return "Reader";
  }

  return STATIC_SECTION_NAMES[pathname] ?? "Dashboard";
}

export function isPrivateNavigationItemActive(pathname: string, href: string) {
  if (!pathname) {
    return href === ROUTES.dashboard;
  }

  if (pathname.startsWith("/reader/")) {
    return href === ROUTES.library;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
