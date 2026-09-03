import { computeRowHours } from "./hours-clock.ts";
import { shahanCrewCostAmount, shahanCrewTitle, type ShahanLookupOpts } from "./shahan-wood-river.ts";
import { defaultLaborClass } from "./labor-class.ts";
import { buildXlsx, type SheetCell } from "./xlsx-minimal.ts";

export const RODEO_TAB_ID = "rodeo";
export const RODEO_TAB_LABEL = "Rodeo";
export const RODEO_FILL_ERROR = "Could not fill the Rodeo form. Try again.";

const HIDDEN_RODEO_SITES = [
  "wood river",
  "bayway",
  "ferndale",
  "billings",
  "yates",
  "monroe",
];

export type RodeoFormState = {
  tarUnit: string;
  contractor: string;
  block: string;
};

export type RodeoCrewRow = {
  position: string;
  billedAs?: string;
  laborClassOverride?: "Merit" | "Union" | null;
  shift?: "Days" | "Nights" | "Days & nights";
  clockOverride?: "auto" | "comp" | "staff";
  ranges: {
    start: string;
    end: string;
    hoursPerShift: number;
    headcount: number;
    nightHeadcount: number;
    sundayHeadcount?: number;
    nightSundayHeadcount?: number;
    perDiemPeople: number;
    nightPerDiemPeople?: number;
    days: boolean[];
    otAfter8?: boolean;
    phaseId?: string;
    shift?: "Days" | "Nights" | "Days & nights";
    skipDates?: string[];
    off?: boolean;
  }[];
};

export type RodeoCrew = {
  staff?: RodeoCrewRow[];
  generalForeman?: RodeoCrewRow[];
  foreman?: RodeoCrewRow[];
  direct?: RodeoCrewRow[];
  support?: RodeoCrewRow[];
  otAfter8?: boolean;
};

export type RodeoLaborBucket = "direct" | "indirect";

export type RodeoLaborLine = {
  bucket: RodeoLaborBucket;
  title: string;
  hours: number;
  dollars: number;
  compositeRate: number;
};

export function emptyRodeoForm(): RodeoFormState {
  return { tarUnit: "", contractor: "", block: "" };
}

export function hydrateRodeoForm(raw: Partial<RodeoFormState> | Record<string, unknown> | null | undefined): RodeoFormState {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    tarUnit: sanitizeRodeoUnit(typeof row.tarUnit === "string" ? row.tarUnit : ""),
    contractor: typeof row.contractor === "string" ? row.contractor : "",
    block: typeof row.block === "string" ? row.block : "",
  };
}

export function isRodeoSite(site = "", client = "") {
  const hay = `${site} ${client}`.toLowerCase();
  if (HIDDEN_RODEO_SITES.some((name) => hay.includes(name))) return false;
  return /\brodeo\b|site-rodeo/.test(hay);
}

export function showsRodeoTab(site = "", client = "") {
  return isRodeoSite(site, client);
}

/** Do not write the plant name Rodeo into UNIT. */
export function sanitizeRodeoUnit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^rodeo$/i.test(trimmed)) return "";
  return trimmed.replace(/\brodeo\b/gi, "").replace(/\s+/g, " ").trim();
}

const INDIRECT_BILLED =
  /\b(foreman|general\s*foreman|\bgf\b|qa\/?qc|quality|safety|clerk|timekeeper|document|office)\b/i;

export function rodeoSupportBucket(billedAs = "", position = ""): RodeoLaborBucket {
  const title = `${billedAs} ${position}`;
  if (INDIRECT_BILLED.test(title)) return "indirect";
  return "direct";
}

export function rodeoRowBucket(lane: "staff" | "generalForeman" | "foreman" | "direct" | "support", row: RodeoCrewRow): RodeoLaborBucket {
  if (lane === "direct") return "direct";
  if (lane === "staff" || lane === "generalForeman" || lane === "foreman") return "indirect";
  return rodeoSupportBucket(row.billedAs, row.position);
}

export function compositeRate(dollars: number, hours: number) {
  if (!(hours > 0) || !Number.isFinite(dollars)) return 0;
  return Math.round((dollars / hours) * 100) / 100;
}

export function rodeoLaborLines(
  crew: RodeoCrew,
  site = "",
  client = "",
  opts: ShahanLookupOpts = {},
): RodeoLaborLine[] {
  const lanes: Array<["staff" | "generalForeman" | "foreman" | "direct" | "support", RodeoCrewRow[] | undefined]> = [
    ["staff", crew.staff],
    ["generalForeman", crew.generalForeman],
    ["foreman", crew.foreman],
    ["direct", crew.direct],
    ["support", crew.support],
  ];
  const lines: RodeoLaborLine[] = [];
  for (const [lane, rows] of lanes) {
    for (const row of rows ?? []) {
      if (!row.position.trim()) continue;
      const hours = computeRowHours(row, site, client, crew.otAfter8);
      const title = shahanCrewTitle(row);
      const dollars = shahanCrewCostAmount(title, hours, {
        ...opts,
        laborClass: row.laborClassOverride ?? defaultLaborClass(title),
      });
      lines.push({
        bucket: rodeoRowBucket(lane, row),
        title,
        hours: hours.hours,
        dollars,
        compositeRate: compositeRate(dollars, hours.hours),
      });
    }
  }
  return lines;
}

export function rodeoBucketTotals(lines: RodeoLaborLine[]) {
  const direct = lines.filter((line) => line.bucket === "direct");
  const indirect = lines.filter((line) => line.bucket === "indirect");
  const sum = (list: RodeoLaborLine[]) => ({
    hours: list.reduce((n, line) => n + line.hours, 0),
    dollars: list.reduce((n, line) => n + line.dollars, 0),
  });
  const d = sum(direct);
  const i = sum(indirect);
  return {
    directHours: d.hours,
    directDollars: d.dollars,
    directRate: compositeRate(d.dollars, d.hours),
    indirectHours: i.hours,
    indirectDollars: i.dollars,
    indirectRate: compositeRate(i.dollars, i.hours),
  };
}

export function rodeoFillMap(input: {
  form: RodeoFormState;
  crew: RodeoCrew;
  site?: string;
  client?: string;
  title?: string;
  opts?: ShahanLookupOpts;
}): { cells: SheetCell[]; lines: RodeoLaborLine[] } {
  const form = hydrateRodeoForm(input.form);
  const lines = rodeoLaborLines(input.crew, input.site, input.client, input.opts);
  const totals = rodeoBucketTotals(lines);
  const cells: SheetCell[] = [
    { ref: "A1", type: "text", value: "HIT SQUAD / PROJECT CONTROLS" },
    { ref: "A2", type: "text", value: "Rodeo form hinge — hours × composite rate. Not the locked P66 workbook." },
    { ref: "A4", type: "text", value: "TAR UNIT" },
    { ref: "B4", type: "text", value: sanitizeRodeoUnit(form.tarUnit) },
    { ref: "A5", type: "text", value: "CONTRACTOR" },
    { ref: "B5", type: "text", value: form.contractor },
    { ref: "A6", type: "text", value: "BLOCK" },
    { ref: "B6", type: "text", value: form.block },
    { ref: "A8", type: "text", value: "Bucket" },
    { ref: "B8", type: "text", value: "Hours" },
    { ref: "C8", type: "text", value: "Composite rate" },
    { ref: "D8", type: "text", value: "Amount" },
    { ref: "A9", type: "text", value: "Direct (time on tools)" },
    { ref: "B9", type: "number", value: totals.directHours },
    { ref: "C9", type: "number", value: totals.directRate },
    { ref: "D9", type: "number", value: totals.directDollars },
    { ref: "A10", type: "text", value: "Indirect (Foreman and above)" },
    { ref: "B10", type: "number", value: totals.indirectHours },
    { ref: "C10", type: "number", value: totals.indirectRate },
    { ref: "D10", type: "number", value: totals.indirectDollars },
  ];
  lines.forEach((line, index) => {
    const excelRow = 12 + index;
    cells.push({ ref: `A${excelRow}`, type: "text", value: line.title });
    cells.push({ ref: `B${excelRow}`, type: "text", value: line.bucket === "direct" ? "Direct" : "Indirect" });
    cells.push({ ref: `C${excelRow}`, type: "number", value: line.hours });
    cells.push({ ref: `D${excelRow}`, type: "number", value: line.compositeRate });
    cells.push({ ref: `E${excelRow}`, type: "number", value: line.dollars });
  });
  return { cells, lines };
}

export function rodeoFormToXlsx(input: {
  form: RodeoFormState;
  crew: RodeoCrew;
  site?: string;
  client?: string;
  title?: string;
  opts?: ShahanLookupOpts;
}): Uint8Array {
  const { cells } = rodeoFillMap(input);
  const bytes = buildXlsx("Rodeo form", cells);
  if (!bytes.byteLength) throw new Error("empty-rodeo-form");
  return bytes;
}

export function rodeoFormFilename(title = "") {
  const base = (title || "Rodeo-form").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `Rodeo-form-${base || "Rodeo-form"}.xlsx`;
}
