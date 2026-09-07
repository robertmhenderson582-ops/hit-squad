export const DESK_NAV: { href: string; label: string; modules?: boolean }[] = [
  { href: "/settings", label: "Settings" },
];

export const HEADER_MODULE_HREFS = [
  "/change-orders",
  "/rates",
  "/cost",
  "/quality",
  "/hse",
  "/purchasing",
  "/modules",
] as const;

export function deskNavLabels(items = DESK_NAV) {
  return items.map((item) => item.label);
}

export function deskNavHasSiblingWorkTabs(items = DESK_NAV) {
  const labels = new Set(deskNavLabels(items).map((label) => label.toLowerCase()));
  return labels.has("jobs") || labels.has("sites") || labels.has("estimates") || labels.has("job sites");
}

export function deskNavHasHeaderModules(items = DESK_NAV) {
  const hrefs = new Set(items.map((item) => item.href));
  return HEADER_MODULE_HREFS.some((href) => hrefs.has(href));
}
