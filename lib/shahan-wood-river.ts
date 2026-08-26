/**
 * Debbie Shahan TM OCIP — P66 Wood River (Roxana, IL).
 * Book: P66 Wood River - Roxanna IL - TM - OCIP UPDATED 8.25.26 DB (equip-tab-rev).
 *
 * Live T&M Wood River dollars. Not COMP, not Nathan CAT 2, not RRFF.
 * Labor tab is 159 rows. The compact catalog is filled from that sheet only —
 * do not invent ST / OT / DT. PT Bill Rate maps to desk DT.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 */

import { computeRowHours, type HoursSplit } from "./hours-clock.ts";

export const SHAHAN_BOOK_LABEL = "Shahan TM OCIP — Wood River";
export const SHAHAN_PLANT = "Wood River";
export const SHAHAN_STAFF_PD = 140;
export const SHAHAN_CRAFT_PD = 130;
export const SHAHAN_OT_MULTIPLIER = 1.5;
export const SHAHAN_PT_MULTIPLIER = 2;

export const SHAHAN_LABOR_GROUPS = [
  "Staff|BM UNION STAFF",
  "Staff|PF UNION STAFF",
  "Staff|MERIT STAFF",
  "CRAFT|OPERATOR UNION",
  "CRAFT|PIPEFITTER UNION",
  "CRAFT|BM UNION",
  "CRAFT|LABORER UNION",
  "CRAFT|TEAMSTER UNION",
] as const;

export type ShahanLaborGroup = (typeof SHAHAN_LABOR_GROUPS)[number] | string;

export type ShahanLaborRow = {
  craftName: string;
  group: ShahanLaborGroup;
  st: number | null;
  ot: number | null;
  dt: number | null;
  pd: number | null;
};

export type ShahanEquipmentRow = {
  description: string;
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
};

export type ShahanLookupOpts = {
  catalog?: ShahanLaborRow[];
};

/** Live labor catalog. Empty until the 159-row Shahan sheet is pasted. Do not invent. */
export const SHAHAN_LABOR: ShahanLaborRow[] = [];

/** Live equipment catalog from the same book. Skip the WET header row. Do not invent. */
export const SHAHAN_EQUIPMENT: ShahanEquipmentRow[] = [];

export const SHAHAN_WET_EQUIPMENT_HEADER = "EQUIPMENT RATES WITH FUEL (WET)";

export type JobRates = {
  staffPerDiemRate: number;
  craftPerDiemRate: number;
  staffMileageRate: number;
  craftMileageRate: number;
};

export function emptyJobRates(): JobRates {
  return {
    staffPerDiemRate: SHAHAN_STAFF_PD,
    craftPerDiemRate: SHAHAN_CRAFT_PD,
    staffMileageRate: 0,
    craftMileageRate: 0,
  };
}

export function hydrateJobRates(raw: Partial<JobRates> | Record<string, unknown> | null | undefined): JobRates {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = emptyJobRates();
  const num = (value: unknown, fallback: number) => {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  };
  const leftoverMileage = num(row.mileageRate, 0);
  return {
    staffPerDiemRate: num(row.staffPerDiemRate, defaults.staffPerDiemRate),
    craftPerDiemRate: num(row.craftPerDiemRate, defaults.craftPerDiemRate),
    staffMileageRate: "staffMileageRate" in row ? num(row.staffMileageRate, 0) : leftoverMileage,
    craftMileageRate: "craftMileageRate" in row ? num(row.craftMileageRate, 0) : leftoverMileage,
  };
}

/**
 * Test-only labor rows. Not in the live catalog. Dollars here are plumbing,
 * not a published Shahan rate.
 */
export const SHAHAN_LABOR_FIXTURE: ShahanLaborRow[] = [
  {
    craftName: "MANAGER, PROJECT 01",
    group: "Staff|MERIT STAFF",
    st: 110,
    ot: 165,
    dt: 220,
    pd: SHAHAN_STAFF_PD,
  },
  {
    craftName: "COORDINATOR QA-QC 1",
    group: "Staff|MERIT STAFF",
    st: 100,
    ot: 150,
    dt: 200,
    pd: SHAHAN_STAFF_PD,
  },
];

/** Official B-1 picker wording → Shahan craftName. Not Nathan estimate titles. */
const B1_TO_SHAHAN: Record<string, string> = {
  "coordinator qa qc 01": "COORDINATOR QA-QC 1",
  "coordinator qa qc 1": "COORDINATOR QA-QC 1",
  "coordinator qa qc 2": "COORDINATOR QA-QC 2",
  "lead qa qc 1": "LEAD QA-QC 01",
  "lead qa qc 01": "LEAD QA-QC 01",
  "manager project 01": "MANAGER, PROJECT 01",
  "manager project 02": "MANAGER, PROJECT 02",
  "lead site 01": "LEAD SITE 01",
  "lead site 02": "LEAD SITE 02",
  "general superintendent 01": "GENERAL SUPERINTENDENT 01",
  "superintendent 01": "SUPERINTENDENT 01",
  "coordinator safety 01": "COORDINATOR SAFETY 01",
  "coordinator safety 02": "COORDINATOR SAFETY 02",
  "lead safety 01": "LEAD SAFETY 01",
  "lead safety 02": "LEAD SAFETY 02",
  "engineer project 01": "ENGINEER, PROJECT 01",
  "engineer project 02": "ENGINEER, PROJECT 02",
  "clerk timekeeper 01": "CLERK TIMEKEEPER 01",
  "clerk document 01": "CLERK DOCUMENT 01",
  "manager office 01": "MANAGER OFFICE 01",
  "boilermaker gf union": "Boilermaker GF Union",
  "pipefitter gf union": "Pipefitter GF Union",
  "boilermaker foreman": "Boilermaker Foreman",
  "pipefitter foreman": "Pipefitter Foreman",
  "laborer foreman 3 9": "Laborer Foreman 3-9",
  "operator foreman gr xii": "Operator Foreman Gr XII",
  "laydown pipefitter foreman": "Laydown Pipefitter Foreman",
};

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nathan CAT 2 estimate names (Merit 01 / 02). Not Shahan craftName. */
export function isNathanEstimateTitle(title: string): boolean {
  return /\bmerit 0?\d+\b/.test(normalizeTitle(title));
}

function classNumberKeys(normalized: string): string[] {
  const match = /^(.*?) (\d+)$/.exec(normalized);
  if (!match) return [normalized];
  const n = String(Number(match[2]));
  const padded = n.padStart(2, "0");
  return Array.from(new Set([normalized, `${match[1]} ${n}`, `${match[1]} ${padded}`]));
}

export function resolveShahanCraftName(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  if (isNathanEstimateTitle(trimmed)) return "";
  const key = normalizeTitle(trimmed);
  return B1_TO_SHAHAN[key] ?? trimmed;
}

function rowKeys(row: ShahanLaborRow): string[] {
  return classNumberKeys(normalizeTitle(row.craftName));
}

export function lookupShahanLabor(title: string, opts: ShahanLookupOpts = {}): ShahanLaborRow | null {
  const catalog = opts.catalog ?? SHAHAN_LABOR;
  if (!catalog.length) return null;
  const resolved = resolveShahanCraftName(title);
  if (!resolved) return null;
  const keys = new Set(classNumberKeys(normalizeTitle(resolved)));
  return catalog.find((row) => rowKeys(row).some((key) => keys.has(key))) ?? null;
}

function priced(rate: number | null | undefined): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

export function hasShahanBillRate(row: ShahanLaborRow | null | undefined): boolean {
  return Boolean(row && (priced(row.st) || priced(row.ot) || priced(row.dt)));
}

export function formatDeskDollars(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shahanCrewCostAmount(
  title: string,
  hours: Pick<HoursSplit, "st" | "ot" | "dt">,
  opts: ShahanLookupOpts = {},
): number {
  const row = lookupShahanLabor(title, opts);
  if (!hasShahanBillRate(row)) return 0;
  const raw =
    (hours.st > 0 && priced(row!.st) ? hours.st * row!.st : 0) +
    (hours.ot > 0 && priced(row!.ot) ? hours.ot * row!.ot : 0) +
    (hours.dt > 0 && priced(row!.dt) ? hours.dt * row!.dt : 0);
  return Math.round(raw * 100) / 100;
}

export function formatShahanCrewCost(
  title: string,
  hours: Pick<HoursSplit, "st" | "ot" | "dt">,
  opts: ShahanLookupOpts = {},
): string {
  return formatDeskDollars(shahanCrewCostAmount(title, hours, opts));
}

export function shahanLaborByGroup(catalog: ShahanLaborRow[] = SHAHAN_LABOR): { group: string; rows: ShahanLaborRow[] }[] {
  const grouped = new Map<string, ShahanLaborRow[]>();
  for (const group of SHAHAN_LABOR_GROUPS) grouped.set(group, []);
  for (const row of catalog) {
    const group = SHAHAN_LABOR_GROUPS.includes(row.group as (typeof SHAHAN_LABOR_GROUPS)[number])
      ? row.group
      : row.group.startsWith("Staff")
        ? "Staff|OTHER"
        : row.group.startsWith("CRAFT")
          ? "CRAFT|OTHER"
          : row.group || "OTHER";
    const list = grouped.get(group) ?? [];
    list.push(row);
    grouped.set(group, list);
  }
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 0 || catalog.length === 0)
    .map(([group, rows]) => ({ group, rows }));
}

export function shahanEquipmentRows(catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT): ShahanEquipmentRow[] {
  return catalog.filter((row) => normalizeTitle(row.description) !== normalizeTitle(SHAHAN_WET_EQUIPMENT_HEADER));
}

export function isStaffPerDiemLane(lane: "staff" | "general-foreman" | "foreman" | "direct" | "support" | string): boolean {
  return lane === "staff" || lane === "general-foreman" || lane === "generalForeman";
}

type HourRow = {
  position: string;
  billedAs?: string;
  shift?: "Days" | "Nights" | "Days & nights";
  clockOverride?: "auto" | "comp" | "staff";
  ranges: {
    start: string;
    end: string;
    hoursPerShift: number;
    headcount: number;
    nightHeadcount: number;
    perDiemPeople: number;
    nightPerDiemPeople?: number;
    days: boolean[];
    otAfter8?: boolean;
    shift?: "Days" | "Nights" | "Days & nights";
    skipDates?: string[];
  }[];
};

export function laborDollarsFromCrew(
  crew: {
    staff?: HourRow[];
    generalForeman?: HourRow[];
    foreman?: HourRow[];
    direct?: HourRow[];
    support?: HourRow[];
    otAfter8?: boolean;
  },
  site = "",
  client = "",
  opts: ShahanLookupOpts = {},
): number {
  const rows = [
    ...(crew.staff ?? []),
    ...(crew.generalForeman ?? []),
    ...(crew.foreman ?? []),
    ...(crew.direct ?? []),
    ...(crew.support ?? []),
  ];
  return (
    Math.round(
      rows.reduce((sum, row) => {
        const hours = computeRowHours(row, site, client, crew.otAfter8);
        const title = row.position || row.billedAs || "";
        return sum + shahanCrewCostAmount(title, hours, opts);
      }, 0) * 100,
    ) / 100
  );
}

export function perDiemDaysFromCrew(
  crew: {
    staff?: HourRow[];
    generalForeman?: HourRow[];
    foreman?: HourRow[];
    direct?: HourRow[];
    support?: HourRow[];
    otAfter8?: boolean;
  },
  site = "",
  client = "",
): { staff: number; craft: number } {
  const staffRows = [...(crew.staff ?? []), ...(crew.generalForeman ?? [])];
  const craftRows = [...(crew.foreman ?? []), ...(crew.direct ?? []), ...(crew.support ?? [])];
  const staff = staffRows.reduce((sum, row) => sum + computeRowHours(row, site, client, crew.otAfter8).pd, 0);
  const craft = craftRows.reduce((sum, row) => sum + computeRowHours(row, site, client, crew.otAfter8).pd, 0);
  return { staff, craft };
}

export function perDiemDollarsFromCrew(
  crew: Parameters<typeof perDiemDaysFromCrew>[0],
  rates: { staffPerDiemRate: number; craftPerDiemRate: number },
  site = "",
  client = "",
): number {
  const days = perDiemDaysFromCrew(crew, site, client);
  return Math.round((days.staff * Math.max(0, rates.staffPerDiemRate) + days.craft * Math.max(0, rates.craftPerDiemRate)) * 100) / 100;
}
