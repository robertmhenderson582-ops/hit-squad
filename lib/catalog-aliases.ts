export type AliasSeat = "owner" | "benny" | "nathan" | "other";

export const ALIAS_CATALOG: { real: string; alias: string; note: string }[] = [
  { real: "Phillips 66", alias: "Ironwood Refining", note: "P66 parent" },
  { real: "P66", alias: "Ironwood", note: "Short mark" },
  { real: "Georgia Power", alias: "Piedmont Power", note: "GPC parent" },
  { real: "Yates", alias: "Ridge Station", note: "GPC plant" },
  { real: "Rodeo", alias: "Harbor Fuels", note: "West plant" },
  { real: "Bayway", alias: "Pacific Fuels", note: "East plant" },
  { real: "Linden", alias: "Bay Point", note: "Bayway city" },
  { real: "Ferndale", alias: "Pacific Fuels North", note: "NW plant" },
  { real: "Wood River", alias: "Midcontinent", note: "Madison plant — Nathan still sees real name" },
  { real: "Billings", alias: "Midcontinent Pipeline", note: "Rockies plant" },
  { real: "Madison", alias: "Shop North", note: "Shop label" },
];

const ORDERED = [...ALIAS_CATALOG].sort((a, b) => b.real.length - a.real.length);

export function shouldApplyAliases(aliasesOn: boolean, seat: AliasSeat): boolean {
  if (!aliasesOn) return false;
  if (seat === "owner" || seat === "nathan") return false;
  return true;
}

export function aliasText(value: string, aliasesOn: boolean, seat: AliasSeat): string {
  if (!shouldApplyAliases(aliasesOn, seat)) return value;
  return ORDERED.reduce((next, row) => next.replace(new RegExp(row.real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), row.alias), value);
}

export function aliasValue<T>(value: T, aliasesOn: boolean, seat: AliasSeat): T {
  if (!shouldApplyAliases(aliasesOn, seat)) return value;
  if (typeof value === "string") return aliasText(value, aliasesOn, seat) as T;
  if (Array.isArray(value)) return value.map((item) => aliasValue(item, aliasesOn, seat)) as T;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) next[key] = aliasValue(item, aliasesOn, seat);
    return next as T;
  }
  return value;
}
