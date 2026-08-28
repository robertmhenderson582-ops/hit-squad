export const DESK_NAV: { href: string; label: string; modules?: boolean }[] = [
  { href: "/jobs", label: "Jobs" },
  { href: "/change-orders", label: "Change orders" },
  { href: "/modules", label: "Future Modules", modules: true },
  { href: "/rates", label: "Rates" },
  { href: "/cost", label: "Cost / PPR" },
  { href: "/settings", label: "Settings" },
];

export function deskNavLabels(items = DESK_NAV) {
  return items.map((item) => item.label);
}

export function deskNavHasSiblingWorkTabs(items = DESK_NAV) {
  const labels = new Set(deskNavLabels(items).map((label) => label.toLowerCase()));
  return labels.has("sites") || labels.has("estimates");
}
