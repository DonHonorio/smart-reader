export interface NavigationItem {
  href: string;
  label: string;
}

export type HealthResponse = {
  status: "ok";
  app: "smart-reader";
};
