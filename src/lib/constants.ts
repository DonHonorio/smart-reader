import type { NavigationItem } from "@/types";

export const APP_NAME = "smart-reader" as const;
export const APP_TITLE = "Smart-Reader";
export const APP_TAGLINE =
  "Read real books, save vocabulary, and export cards to Anki.";

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  library: "/library",
  vocabulary: "/vocabulary",
  export: "/export",
  reader: (bookId: string) => `/reader/${bookId}`,
} as const;

export const MAIN_NAV_LINKS: NavigationItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard" },
  { href: ROUTES.library, label: "Library" },
  { href: ROUTES.vocabulary, label: "Vocabulary" },
  { href: ROUTES.export, label: "Export" },
];
