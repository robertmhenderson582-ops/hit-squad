export const B2_PLANT = "PCA0001103";
export const B2_COAST = "East Coast";
export const B2_WEST_PLANT = "PCA0001100";

export type B2Period = "hourly" | "daily" | "weekly" | "monthly";
export type B2Billing = "dry" | "cost-plus" | "no-cost" | "skip";

export type B2Item = {
  id: string;
  description: string;
  hourly: number | null;
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  mob: number | null;
  replacement: number | null;
  requiresOperator: boolean;
  billing: B2Billing;
};

function item(
  description: string,
  hourly: number | null,
  daily: number | null,
  weekly: number | null,
  monthly: number | null,
  extra: Partial<Pick<B2Item, "requiresOperator" | "billing" | "mob" | "replacement">> = {},
): B2Item {
  return {
    id: description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    description,
    hourly,
    daily,
    weekly,
    monthly,
    mob: extra.mob ?? null,
    replacement: extra.replacement ?? null,
    requiresOperator: Boolean(extra.requiresOperator),
    billing: extra.billing ?? "dry",
  };
}

/** East Coast COMP B-2 large tools (dry, w/o fuel). Mob / replacement stay blank unless sourced. */
export const B2_EAST_COAST: B2Item[] = [
  item("AIR MOVER", 4, 32, 96, 288),
  item("EXTRACTOR BUNDLE AERIAL <21FT", 189, 1512, 4536, 13608, { requiresOperator: true }),
  item("EXTRACTOR BUNDLE AERIAL <26FT", 189, 1512, 4536, 13608, { requiresOperator: true }),
  item("EXTRACTOR BUNDLE AERIAL <33FT", 189, 1512, 4536, 13608, { requiresOperator: true }),
  item("EXTRACTOR BUNDLE AERIAL 45 TON", 315, 2520, 7560, 22680, { requiresOperator: true }),
  item("EXTRACTOR SELF PROPELLED", 370, 2960, 8880, 26640, { requiresOperator: true }),
  item("EXTRACTOR TRUCK MOUNT", 270, 2160, 6480, 19440, { requiresOperator: true }),
  item('MACHINE FLANGE FACING <24"', 120, 960, 2880, 8640, { requiresOperator: true }),
  item('MACHINE FLANGE FACING 14"-36"', 140, 1120, 3360, 10080, { requiresOperator: true }),
  item('MACHINE FLANGE FACING 2"-12"', 120, 960, 2880, 8640, { requiresOperator: true }),
  item('MACHINE FLANGE FACING 24"-60"', 120, 960, 2880, 8640, { requiresOperator: true }),
  item('MACHINE FLANGE FACING 38"-60"', 120, 960, 2880, 8640, { requiresOperator: true }),
  item('MACHINE FLANGE FACING 60"-80"', 120, 960, 2880, 8640, { requiresOperator: true }),
  item('PIPE CUT BEVEL 14"-24"', 114, 912, 2736, 8208, { requiresOperator: true }),
  item('PIPE CUT BEVEL 26"-36"', 128, 1024, 3072, 9216, { requiresOperator: true }),
  item('PIPE CUT BEVEL OVER 36"', 140, 1120, 3360, 10080, { requiresOperator: true }),
  item('PIPE CUT BEVEL TO 12"', 114, 912, 2736, 8208, { requiresOperator: true }),
  item("PUMP HYDROSTATIC TEST", 26, 208, 624, 1872),
  item("PUMP TORQUE CONSOLE 10K PSI thru 60k ft lb", 165, 1320, 3960, 11880),
  item("TRAILER FLATBED", 6, 48, 144, 432),
  item("TRAILER GOOSENECK", 18, 144, 432, 1296),
  item("TRAILER TOOL <40FT", 26, 208, 624, 1872),
  item("TRAILER TOOL >40FT", 25, 200, 600, 1800),
  item("TRAILER TOWER TRAY HARDWARE CONSIGNMENT", 50, 400, 1200, 3600, { billing: "cost-plus" }),
  item("TRAILER TUBE BUNDLE", 29, 232, 696, 2088),
  item("TRUCK CREW", 13, 104, 312, 936),
  item("VAN 15 PASSENGER", 22, 176, 528, 1584),
  item("WELDER ARC 100-300 AMP Electric", 8.5, 68, 204, 612),
  item("WELDER ARC 301-499 AMP Electric", 11, 88, 264, 792),
  item("WELDER EIGHT BANK", 15, 120, 360, 1080),
  item("Bundle Dolly", 29, 232, 696, 2088),
  item("RAD Gun Torque", 62, 496, 1488, 4464),
  item("Pipe Threaders (535+)", null, null, null, null, { billing: "cost-plus" }),
  item("Spreader Bars", null, null, null, null, { billing: "cost-plus" }),
  item("Porta-Power >25T", null, null, null, null, { billing: "cost-plus" }),
  item("Beam Trolleys >5T", null, null, null, null, { billing: "cost-plus" }),
  item("TRAILER ALKY DECON", null, null, null, null, { billing: "no-cost" }),
  item("TRAILER WELDING", null, null, null, null, { billing: "skip" }),
  item("PUMP TORQUE CONSOLE 10K (wrenches)", null, null, null, null, { billing: "skip" }),
  item("TRUCK RIG WELDER", null, null, null, null, { billing: "skip" }),
];

export const B2_PERIODS: { id: B2Period; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export function b2ItemById(id: string): B2Item | undefined {
  return B2_EAST_COAST.find((row) => row.id === id);
}

export function billableB2Items(): B2Item[] {
  return B2_EAST_COAST.filter((row) => row.billing === "dry" || row.billing === "cost-plus");
}

export function periodRate(item: B2Item, period: B2Period): number | null {
  if (period === "hourly") return item.hourly;
  if (period === "daily") return item.daily;
  if (period === "weekly") return item.weekly;
  return item.monthly;
}

/** 8 hr = day, 3 days = week, 3 weeks = month. */
export function clockPeriods(hours: number) {
  const days = hours / 8;
  const weeks = days / 3;
  const months = weeks / 3;
  return { hours, days, weeks, months };
}

export function b2LineTotal(item: B2Item, period: B2Period, qty: number, enteredCost?: number) {
  if (item.billing === "no-cost" || item.billing === "skip") return 0;
  const dry = periodRate(item, period);
  if (dry != null) return dry * Math.max(0, qty) + (item.mob ?? 0);
  if (item.billing === "cost-plus") return markup6(enteredCost ?? 0);
  return 0;
}

export function markup6(cost: number) {
  return Math.round(Math.max(0, cost) * 1.06 * 100) / 100;
}

export function isWestCoastPlant(code: string) {
  return code.trim().toUpperCase() === B2_WEST_PLANT;
}
