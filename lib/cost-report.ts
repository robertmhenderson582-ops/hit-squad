/**
 * Mike cost report — Day-1 on the live estimate pack.
 * Budget / hours come from the desk estimate (estimate-desk-total + crew clocks).
 * Actuals are Turnip T3 Export 15 (hours) and Export 16 (dollars) paste/upload.
 * No full time-entry UI. East Coast clocks stay in hours-clock (no DT-after-12 rewrite).
 * Vault is source of truth after hydrate — same notify path as ECR.
 */
import { COST_REPORT_STORE_PREFIX } from "./cost-report-prefix.ts";
import { craftRowsFromCrew, hoursFromCrewRows } from "./crew-hours.ts";
import type { CraftRow } from "./craft-labor.ts";
import {
  deskPackageBreakdown,
  fcrChangeOrderTotal,
  fcrFromUnknown,
  type DeskPackageCrew,
  type DeskPackageInput,
} from "./estimate-desk-total.ts";
import { hydrateJobMoney } from "./estimate-money.ts";
import type { EstimateTotalBreakdown, EstimateTotalLine } from "./estimate-total.ts";
import { computeRangeHours } from "./hours-clock.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export { COST_REPORT_STORE_PREFIX };
export const COST_REPORT_TAB_ID = "cost-report";
export const COST_REPORT_TAB_LABEL = "Cost report";
export const COST_REPORT_NOUN = "Cost / Progress / Performance";
export const COST_REPORT_LIVE_NOTE =
  "Budget and estimate hours come from this job’s live estimate pack — not Mike’s Excel estimate links.";
export const COST_REPORT_PARKED = [
  "Full CPI / SPI earned-value table",
  "SCR page",
  "P66 Progress book",
  "Typed time-entry UI (Turnip 15 / 16 paste stays the ingest)",
] as const;

export type CostReportStoreLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type TurnipExportKind = "15" | "16";

export type TurnipRow = {
  date: string;
  craft: string;
  employee: string;
  st: number;
  ot: number;
  dt: number;
  hours: number;
  dollars: number;
  headcount: number;
  note: string;
};

export type TurnipPaste = {
  raw: string;
  rows: TurnipRow[];
};

export type CostBudget = {
  total: number;
  hours: number;
  lines: EstimateTotalLine[];
};

export type CostActuals = {
  hours: number;
  dollars: number;
  headcount: number;
  byDate: Record<string, { hours: number; dollars: number; headcount: number }>;
};

export type CostCurvePoint = {
  date: string;
  estHours: number;
  actHours: number;
  estHeadcount: number;
  actHeadcount: number;
  cumEstHours: number;
  cumActHours: number;
};

export type CostReportSnapshot = {
  id: string;
  statusDate: string;
  savedAt: number;
  notes: string;
  budget: CostBudget;
  actuals: CostActuals;
  export15: TurnipPaste;
  export16: TurnipPaste;
};

export type CostReportBook = {
  statusDate: string;
  notes: string;
  export15: TurnipPaste;
  export16: TurnipPaste;
  snapshots: CostReportSnapshot[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function filledText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function todayYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLooseDate(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (us) {
    const m = Number(us[1]);
    const d = Number(us[2]);
    let y = Number(us[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return "";
}

export function parseDeskNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value) return 0;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function emptyPaste(): TurnipPaste {
  return { raw: "", rows: [] };
}

export function emptyCostBudget(): CostBudget {
  return { total: 0, hours: 0, lines: [] };
}

export function emptyCostActuals(): CostActuals {
  return { hours: 0, dollars: 0, headcount: 0, byDate: {} };
}

export function emptyCostReportBook(): CostReportBook {
  return {
    statusDate: todayYmd(),
    notes: "",
    export15: emptyPaste(),
    export16: emptyPaste(),
    snapshots: [],
  };
}

function normalizePaste(raw: unknown): TurnipPaste {
  const row = asRecord(raw);
  const text = typeof row?.raw === "string" ? row.raw : typeof raw === "string" ? raw : "";
  const listed = Array.isArray(row?.rows) ? row.rows : [];
  const rows = listed
    .map((item) => normalizeTurnipRow(item))
    .filter((item) => item.date || item.hours || item.dollars || item.craft || item.employee);
  return { raw: text, rows: rows.length ? rows : parseTurnipPaste(text).rows };
}

function normalizeTurnipRow(raw: unknown): TurnipRow {
  const row = asRecord(raw) ?? {};
  const hours = Math.max(0, parseDeskNumber(row.hours));
  const st = Math.max(0, parseDeskNumber(row.st));
  const ot = Math.max(0, parseDeskNumber(row.ot));
  const dt = Math.max(0, parseDeskNumber(row.dt));
  return {
    date: parseLooseDate(typeof row.date === "string" ? row.date : "") || "",
    craft: typeof row.craft === "string" ? row.craft.trim() : "",
    employee: typeof row.employee === "string" ? row.employee.trim() : "",
    st,
    ot,
    dt,
    hours: hours || money(st + ot + dt),
    dollars: Math.max(0, money(parseDeskNumber(row.dollars))),
    headcount: Math.max(0, parseDeskNumber(row.headcount)),
    note: typeof row.note === "string" ? row.note : "",
  };
}

export function costReportHasWork(value: unknown) {
  const row = asRecord(value);
  if (!row) return false;
  if (Array.isArray(row.snapshots) && row.snapshots.length > 0) return true;
  if (filledText(row.notes)) return true;
  const exp15 = asRecord(row.export15);
  const exp16 = asRecord(row.export16);
  if (filledText(exp15?.raw) || (Array.isArray(exp15?.rows) && exp15.rows.length > 0)) return true;
  if (filledText(exp16?.raw) || (Array.isArray(exp16?.rows) && exp16.rows.length > 0)) return true;
  return false;
}

export function hydrateCostReport(raw: unknown): CostReportBook {
  const parsed = asRecord(raw);
  if (!parsed) return emptyCostReportBook();
  const snapshots = Array.isArray(parsed.snapshots)
    ? parsed.snapshots
        .map((item) => hydrateSnapshot(item))
        .filter((item): item is CostReportSnapshot => Boolean(item))
    : [];
  return {
    statusDate: parseLooseDate(typeof parsed.statusDate === "string" ? parsed.statusDate : "") || todayYmd(),
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    export15: normalizePaste(parsed.export15),
    export16: normalizePaste(parsed.export16),
    snapshots,
  };
}

function hydrateSnapshot(raw: unknown): CostReportSnapshot | null {
  const row = asRecord(raw);
  if (!row) return null;
  const statusDate = parseLooseDate(typeof row.statusDate === "string" ? row.statusDate : "");
  if (!statusDate) return null;
  const budget = asRecord(row.budget);
  const actuals = asRecord(row.actuals);
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : uid("ppr"),
    statusDate,
    savedAt: Number(row.savedAt) || 0,
    notes: typeof row.notes === "string" ? row.notes : "",
    budget: {
      total: money(parseDeskNumber(budget?.total)),
      hours: Math.max(0, parseDeskNumber(budget?.hours)),
      lines: Array.isArray(budget?.lines)
        ? budget.lines
            .map((line) => {
              const item = asRecord(line);
              if (!item || typeof item.id !== "string" || typeof item.label !== "string") return null;
              return { id: item.id, label: item.label, amount: money(parseDeskNumber(item.amount)) };
            })
            .filter((line): line is EstimateTotalLine => Boolean(line))
        : [],
    },
    actuals: {
      hours: Math.max(0, parseDeskNumber(actuals?.hours)),
      dollars: money(parseDeskNumber(actuals?.dollars)),
      headcount: Math.max(0, parseDeskNumber(actuals?.headcount)),
      byDate: asRecord(actuals?.byDate)
        ? Object.fromEntries(
            Object.entries(asRecord(actuals?.byDate) ?? {}).map(([date, value]) => {
              const day = asRecord(value);
              return [
                date,
                {
                  hours: Math.max(0, parseDeskNumber(day?.hours)),
                  dollars: money(parseDeskNumber(day?.dollars)),
                  headcount: Math.max(0, parseDeskNumber(day?.headcount)),
                },
              ];
            }),
          )
        : {},
    },
    export15: normalizePaste(row.export15),
    export16: normalizePaste(row.export16),
  };
}

function browserStore(store?: CostReportStoreLike | null): CostReportStoreLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readCostReport(key: string, store?: CostReportStoreLike | null): CostReportBook {
  const target = browserStore(store);
  if (!target || !key) return emptyCostReportBook();
  try {
    const raw = target.getItem(`${COST_REPORT_STORE_PREFIX}${key}`);
    if (!raw) return emptyCostReportBook();
    return hydrateCostReport(JSON.parse(raw));
  } catch {
    return emptyCostReportBook();
  }
}

/** Cache locally, then notify the live pack so vault upsert follows the estimate. */
export function writeCostReport(key: string, book: CostReportBook, store?: CostReportStoreLike | null) {
  const target = browserStore(store);
  if (!target || !key) return;
  try {
    target.setItem(`${COST_REPORT_STORE_PREFIX}${key}`, JSON.stringify(hydrateCostReport(book)));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}

const HEADER_DATE = /^(date|work\s*date|day|worked)$/i;
const HEADER_CRAFT = /^(craft|trade|class|position|cost\s*code)$/i;
const HEADER_EMPLOYEE = /^(employee|name|badge|emp)/i;
const HEADER_ST = /^(st|reg|regular|straight)/i;
const HEADER_OT = /^(ot|overtime|o\.t)/i;
const HEADER_DT = /^(dt|double)/i;
const HEADER_HOURS = /^(hours|hrs|mh|man[\s-]*hours|total\s*hrs)$/i;
const HEADER_DOLLARS = /^(dollars?|amount|cost|total\s*\$|\$|pay|wages)$/i;
const HEADER_HC = /^(hc|headcount|heads|people|qty)$/i;

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  if (line.includes("|")) return line.split("|").map((cell) => cell.trim());
  if (line.includes(";")) return line.split(";").map((cell) => cell.trim());
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function looksLikeHeader(cells: string[]) {
  return cells.some((cell) => HEADER_DATE.test(cell) || HEADER_HOURS.test(cell) || HEADER_DOLLARS.test(cell) || HEADER_CRAFT.test(cell));
}

function headerIndex(cells: string[], test: RegExp) {
  return cells.findIndex((cell) => test.test(cell));
}

/** Turnip T3 Export 15 / 16 — tab/CSV paste the way Mike drops them. No invented columns. */
export function parseTurnipPaste(raw: string, kind: TurnipExportKind = "15"): TurnipPaste {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return emptyPaste();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return emptyPaste();
  const first = splitLine(lines[0]);
  const headed = looksLikeHeader(first);
  const headers = headed ? first : [];
  const dateCol = headed ? headerIndex(headers, HEADER_DATE) : 0;
  const craftCol = headed ? headerIndex(headers, HEADER_CRAFT) : 1;
  const employeeCol = headed ? headerIndex(headers, HEADER_EMPLOYEE) : -1;
  const stCol = headed ? headerIndex(headers, HEADER_ST) : -1;
  const otCol = headed ? headerIndex(headers, HEADER_OT) : -1;
  const dtCol = headed ? headerIndex(headers, HEADER_DT) : -1;
  const hoursCol = headed ? headerIndex(headers, HEADER_HOURS) : kind === "15" ? 2 : -1;
  const dollarCol = headed ? headerIndex(headers, HEADER_DOLLARS) : kind === "16" ? 2 : -1;
  const hcCol = headed ? headerIndex(headers, HEADER_HC) : -1;
  const body = headed ? lines.slice(1) : lines;
  const rows: TurnipRow[] = [];
  for (const line of body) {
    const cells = splitLine(line);
    if (!cells.some((cell) => cell)) continue;
    const date = parseLooseDate(dateCol >= 0 ? cells[dateCol] ?? "" : cells[0] ?? "");
    const st = stCol >= 0 ? parseDeskNumber(cells[stCol]) : 0;
    const ot = otCol >= 0 ? parseDeskNumber(cells[otCol]) : 0;
    const dt = dtCol >= 0 ? parseDeskNumber(cells[dtCol]) : 0;
    const hours = hoursCol >= 0 ? parseDeskNumber(cells[hoursCol]) : money(st + ot + dt);
    const dollars = dollarCol >= 0 ? parseDeskNumber(cells[dollarCol]) : 0;
    const headcount = hcCol >= 0 ? parseDeskNumber(cells[hcCol]) : 0;
    if (!date && !hours && !dollars && !st && !ot && !dt) continue;
    rows.push({
      date,
      craft: craftCol >= 0 ? cells[craftCol] ?? "" : "",
      employee: employeeCol >= 0 ? cells[employeeCol] ?? "" : "",
      st: Math.max(0, st),
      ot: Math.max(0, ot),
      dt: Math.max(0, dt),
      hours: Math.max(0, hours || money(st + ot + dt)),
      dollars: Math.max(0, money(dollars)),
      headcount: Math.max(0, headcount),
      note: "",
    });
  }
  return { raw: text, rows };
}

export function applyTurnipPaste(book: CostReportBook, kind: TurnipExportKind, raw: string): CostReportBook {
  const paste = parseTurnipPaste(raw, kind);
  return kind === "15" ? { ...book, export15: paste } : { ...book, export16: paste };
}

export function costActualsFromPastes(export15: TurnipPaste, export16: TurnipPaste, throughDate = ""): CostActuals {
  const byDate: CostActuals["byDate"] = {};
  const bump = (date: string, patch: Partial<CostActuals["byDate"][string]>) => {
    if (throughDate && date && date > throughDate) return;
    const key = date || "_";
    const cur = byDate[key] ?? { hours: 0, dollars: 0, headcount: 0 };
    byDate[key] = {
      hours: cur.hours + (patch.hours ?? 0),
      dollars: money(cur.dollars + (patch.dollars ?? 0)),
      headcount: cur.headcount + (patch.headcount ?? 0),
    };
  };
  for (const row of export15.rows) {
    bump(row.date, {
      hours: row.hours,
      headcount: row.headcount || (row.hours > 0 ? 1 : 0),
    });
  }
  for (const row of export16.rows) {
    bump(row.date, { dollars: row.dollars, hours: row.hours && !export15.rows.length ? row.hours : 0 });
  }
  const days = Object.entries(byDate).filter(([date]) => date !== "_");
  return {
    hours: money(days.reduce((sum, [, day]) => sum + day.hours, 0) + (byDate._?.hours ?? 0)),
    dollars: money(days.reduce((sum, [, day]) => sum + day.dollars, 0) + (byDate._?.dollars ?? 0)),
    headcount: days.reduce((sum, [, day]) => Math.max(sum, day.headcount), 0),
    byDate,
  };
}

export function deskBudgetFromPack(input: DeskPackageInput): CostBudget {
  const hours =
    input.hours ??
    hoursFromCrewRows(
      craftRowsFromCrew((input.crew ?? {}) as Parameters<typeof craftRowsFromCrew>[0]),
      input.site,
      input.client,
      hydrateJobMoney(input.jobMeta).holidays,
    );
  const breakdown: EstimateTotalBreakdown = deskPackageBreakdown({
    ...input,
    hours,
    changeOrders: input.changeOrders ?? 0,
  });
  return {
    total: money(breakdown.total),
    hours: Math.max(0, breakdown.hours),
    lines: breakdown.lines,
  };
}

export function deskBudgetFromSheets(input: {
  crew?: DeskPackageCrew;
  site?: string;
  client?: string;
  equipment?: DeskPackageInput["equipment"];
  otherCost?: DeskPackageInput["otherCost"];
  subcontractor?: DeskPackageInput["subcontractor"];
  jobMeta?: DeskPackageInput["jobMeta"];
  fcr?: unknown;
}): CostBudget {
  return deskBudgetFromPack({
    crew: input.crew,
    site: input.site,
    client: input.client,
    equipment: input.equipment,
    otherCost: input.otherCost,
    subcontractor: input.subcontractor,
    jobMeta: input.jobMeta,
    changeOrders: fcrChangeOrderTotal(fcrFromUnknown(input.fcr)),
  });
}

function rangeDayHours(row: CraftRow, site: string, client: string, holidays: string[], crewOtAfter8 = false) {
  const points: Array<{ date: string; hours: number; headcount: number }> = [];
  for (const range of row.ranges ?? []) {
    if (range.off || !range.start || !range.end) continue;
    const split = computeRangeHours({
      position: row.position,
      billedAs: row.billedAs,
      site,
      client,
      start: range.start,
      end: range.end,
      hoursPerShift: range.hoursPerShift,
      headcount: range.headcount,
      nightHeadcount: range.nightHeadcount,
      sundayHeadcount: range.sundayHeadcount,
      nightSundayHeadcount: range.nightSundayHeadcount,
      shift: range.shift ?? row.shift,
      days: range.days,
      perDiemPeople: range.perDiemPeople,
      nightPerDiemPeople: range.nightPerDiemPeople,
      otAfter8: range.otAfter8 ?? crewOtAfter8,
      phaseId: range.phaseId,
      clockOverride: row.clockOverride ?? "auto",
      skipDates: range.skipDates,
      holidays,
    });
    const hps = range.hoursPerShift || 0;
    for (const day of split.days) {
      const hours = day.st + day.ot + day.dt;
      if (hours <= 0) continue;
      points.push({
        date: day.date,
        hours,
        headcount: hps > 0 ? hours / hps : range.headcount || 1,
      });
    }
  }
  return points;
}

export function estimateCurveFromCrew(
  crew: DeskPackageCrew | undefined,
  site = "",
  client = "",
  holidays: string[] = [],
): Array<{ date: string; estHours: number; estHeadcount: number }> {
  const byDate = new Map<string, { estHours: number; estHeadcount: number }>();
  for (const row of craftRowsFromCrew((crew ?? {}) as Parameters<typeof craftRowsFromCrew>[0])) {
    if (!row.position?.trim()) continue;
    for (const point of rangeDayHours(row, site, client, holidays, Boolean(crew?.otAfter8))) {
      const cur = byDate.get(point.date) ?? { estHours: 0, estHeadcount: 0 };
      cur.estHours += point.hours;
      cur.estHeadcount += point.headcount;
      byDate.set(point.date, cur);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      estHours: money(value.estHours),
      estHeadcount: money(value.estHeadcount),
    }));
}

export function buildCostCurve(
  estimate: Array<{ date: string; estHours: number; estHeadcount: number }>,
  actuals: CostActuals,
  throughDate = "",
): CostCurvePoint[] {
  const dates = new Set<string>();
  for (const row of estimate) {
    if (!throughDate || row.date <= throughDate) dates.add(row.date);
  }
  for (const date of Object.keys(actuals.byDate)) {
    if (date !== "_" && (!throughDate || date <= throughDate)) dates.add(date);
  }
  const estBy = new Map(estimate.map((row) => [row.date, row]));
  let cumEst = 0;
  let cumAct = 0;
  return [...dates]
    .sort()
    .map((date) => {
      const est = estBy.get(date);
      const act = actuals.byDate[date];
      const estHours = est?.estHours ?? 0;
      const actHours = act?.hours ?? 0;
      cumEst += estHours;
      cumAct += actHours;
      return {
        date,
        estHours,
        actHours,
        estHeadcount: est?.estHeadcount ?? 0,
        actHeadcount: act?.headcount ?? 0,
        cumEstHours: money(cumEst),
        cumActHours: money(cumAct),
      };
    });
}

export function variance(budget: number, actual: number) {
  return money(budget - actual);
}

export function spentPct(budget: number, actual: number) {
  if (!budget) return 0;
  return money(actual / budget);
}

export function snapshotList(book: CostReportBook): CostReportSnapshot[] {
  return [...book.snapshots].sort((a, b) => {
    if (a.statusDate !== b.statusDate) return b.statusDate.localeCompare(a.statusDate);
    return b.savedAt - a.savedAt;
  });
}

export function latestSnapshotForDate(book: CostReportBook, statusDate: string): CostReportSnapshot | undefined {
  return snapshotList(book).find((row) => row.statusDate === statusDate);
}

export function saveCostSnapshot(
  book: CostReportBook,
  budget: CostBudget,
  savedAt = Date.now(),
): CostReportBook {
  const statusDate = parseLooseDate(book.statusDate) || todayYmd();
  const actuals = costActualsFromPastes(book.export15, book.export16, statusDate);
  const snapshot: CostReportSnapshot = {
    id: uid("ppr"),
    statusDate,
    savedAt,
    notes: book.notes,
    budget,
    actuals,
    export15: { raw: book.export15.raw, rows: book.export15.rows.map((row) => ({ ...row })) },
    export16: { raw: book.export16.raw, rows: book.export16.rows.map((row) => ({ ...row })) },
  };
  const snapshots = [snapshot, ...book.snapshots.filter((row) => row.statusDate !== statusDate)];
  return { ...book, statusDate, snapshots };
}

export function openCostSnapshot(book: CostReportBook, snapshotId: string): CostReportBook {
  const shot = book.snapshots.find((row) => row.id === snapshotId);
  if (!shot) return book;
  return {
    ...book,
    statusDate: shot.statusDate,
    notes: shot.notes,
    export15: { raw: shot.export15.raw, rows: shot.export15.rows.map((row) => ({ ...row })) },
    export16: { raw: shot.export16.raw, rows: shot.export16.rows.map((row) => ({ ...row })) },
  };
}

export type LiveCostJob = {
  id: string;
  title: string;
  client: string;
  site: string;
  key: string;
};

export function liveCostJobs(
  packs: Array<{ packId: string; title: string; client: string; site: string; key?: string }> = [],
): LiveCostJob[] {
  const seen = new Set<string>();
  const out: LiveCostJob[] = [];
  for (const pack of packs) {
    if (!pack.packId || seen.has(pack.packId)) continue;
    seen.add(pack.packId);
    out.push({
      id: pack.packId,
      title: pack.title || "Working estimate",
      client: pack.client || "",
      site: pack.site || "",
      key: pack.key || `new:${pack.packId}`,
    });
  }
  return out;
}
