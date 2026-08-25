export type AliasSeat = "owner" | "real" | "aliased";

export const ALIAS_CATALOG: { real: string; alias: string; note: string }[] = [
  { real: "Phillips 66", alias: "Ironwood Refining", note: "Parent" },
  { real: "P66", alias: "Ironwood", note: "Short mark" },
  { real: "Kinder Morgan", alias: "Midcontinent Pipeline", note: "Pipeline parent" },
  { real: "Wood River terminal", alias: "Midwest Terminal", note: "KM terminal" },
  { real: "Wood River", alias: "Midwest", note: "Plant — titles like Midwest CAT 2" },
  { real: "Bayway", alias: "East", note: "East plant" },
  { real: "Rodeo", alias: "West", note: "West plant" },
  { real: "Ferndale", alias: "Northwest", note: "Northwest plant" },
  { real: "Billings", alias: "Rockies", note: "Rockies plant" },
  { real: "Georgia Power", alias: "Piedmont Power", note: "GPC parent" },
  { real: "GP", alias: "Piedmont Power", note: "GPC short" },
  { real: "Yates", alias: "Ridge Station", note: "GPC plant" },
  { real: "Monroe Energy", alias: "Harbor Fuels", note: "Trainer parent" },
  { real: "Monroe", alias: "Harbor Fuels", note: "Harbor parent short" },
  { real: "Trainer", alias: "Harbor Works", note: "Harbor plant" },
  { real: "Chevron", alias: "Pacific Fuels", note: "Richmond parent" },
  { real: "Richmond", alias: "Bay Point", note: "Pacific plant" },
  { real: "Roxana", alias: "Midland", note: "Midwest city" },
  { real: "Newnan", alias: "Piedmont", note: "Ridge Station city" },
  { real: "Linden", alias: "Eastport", note: "East city" },
  { real: "Marcus Hook", alias: "Harbor", note: "Harbor city" },
];

const ORDERED = [...ALIAS_CATALOG].sort((a, b) => b.real.length - a.real.length);

export function shouldApplyAliases(aliasesOn: boolean, seat: AliasSeat): boolean {
  if (seat === "real") return false;
  if (seat === "owner") return aliasesOn;
  return true;
}

export function aliasText(value: string, aliasesOn: boolean, seat: AliasSeat): string {
  if (!shouldApplyAliases(aliasesOn, seat)) return value;
  return ORDERED.reduce(
    (next, row) => next.replace(new RegExp(row.real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), row.alias),
    value,
  );
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
