/**
 * Schema + Summary-sheet ingest for 01 DailyReport_TOTAL.
 * Drive / Brad live books stay off git. Day-1 reads Summary only.
 *
 * Phase block (headers ~row 33, labels in column B):
 * PRE / SD / TA / SU / POST / Grand Total
 * B→N: Phase | Target Mhr | SCR Mhr | Current Mhr | Remain Mhr |
 * Planned Mhr | Earned Mhr | Plan % | Actual % | SCR Delta |
 * Inc Plan | Inc Actual | Inc Delta
 */
import ExcelJS from "exceljs";
import type { PhaseId } from "./phase-schedule.ts";

export const DAILY_REPORT_TOTAL_FILE = "01 DailyReport_TOTAL";
export const DAILY_REPORT_TOTAL_BASELINE = "Copy of 01 DailyReport_TOTAL - Baseline.xlsx";

export const DAILY_REPORT_TOTAL_SHEETS = {
  summary: "Summary",
  companyExpense: "Company Expense",
  equip: "Equip",
  mechanicalCompleted: "Mechanical Completed",
  completeScope: "Complete Scope",
} as const;

export const DAILY_REPORT_TOTAL_KPI_COLUMNS = [
  "Target Mhr",
  "SCR Mhr",
  "Current Mhr",
  "Remain Mhr",
  "Planned Mhr",
  "Earned Mhr",
  "Plan %",
  "Actual %",
  "SCR Delta",
  "Inc Plan",
  "Inc Actual",
  "Inc Delta",
] as const;

export type DailyReportPhaseCode = "PRE" | "SD" | "TA" | "SU" | "POST";

export const DAILY_REPORT_PHASES: ReadonlyArray<{
  code: DailyReportPhaseCode;
  phaseId: PhaseId;
  label: string;
}> = [
  { code: "PRE", phaseId: "pre", label: "Pre-Turnaround" },
  { code: "SD", phaseId: "oil-out", label: "Shutdown / Oil Out" },
  { code: "TA", phaseId: "mech", label: "Turnaround / Mechanical" },
  { code: "SU", phaseId: "oil-in", label: "Startup / Oil In" },
  { code: "POST", phaseId: "post", label: "Post" },
];

export const DAILY_REPORT_GRAND_TOTAL = "Grand Total";

/** Day-1 Cost report fields taken from Summary Phase Grand Total. */
export const DAILY_REPORT_DESK_FIELDS = [
  { id: "targetHours", column: "Target Mhr" },
  { id: "plannedHours", column: "Planned Mhr" },
  { id: "earnedHours", column: "Earned Mhr" },
  { id: "planPct", column: "Plan %" },
  { id: "earnedPct", column: "Actual %" },
] as const;

export const DAILY_REPORT_UPLOAD_NOTE =
  "Upload 01 DailyReport_TOTAL to fill these from Summary Phase Grand Total. Type them when you do not have the file. Slicer stays parked.";

export const DAILY_REPORT_PARSE_ERROR =
  "Could not find a Summary Phase block (PRE / SD / TA / SU / POST + Grand Total). Use 01 DailyReport_TOTAL.";

export const DAILY_REPORT_READ_ERROR =
  "Could not read that workbook. Save 01 DailyReport_TOTAL as .xlsx and try again.";

export function dailyReportPhaseId(code: string): PhaseId | null {
  const key = code.trim().toUpperCase();
  return DAILY_REPORT_PHASES.find((row) => row.code === key)?.phaseId ?? null;
}

export function dailyReportPhaseCode(phaseId: PhaseId): DailyReportPhaseCode | null {
  return DAILY_REPORT_PHASES.find((row) => row.phaseId === phaseId)?.code ?? null;
}

export class DailyReportParseError extends Error {
  constructor(message = DAILY_REPORT_PARSE_ERROR) {
    super(message);
    this.name = "DailyReportParseError";
  }
}

export type DailyReportPhaseRow = {
  label: string;
  row: number;
  code: DailyReportPhaseCode | null;
  grandTotal: boolean;
  targetMhr: number | null;
  currentMhr: number | null;
  plannedMhr: number | null;
  earnedMhr: number | null;
  planPct: number | null;
  actualPct: number | null;
  incActual: number | null;
};

export type DailyReportParse = {
  sheet: string;
  headerRow: number;
  grandTotal: DailyReportPhaseRow;
  phases: DailyReportPhaseRow[];
};

export type DailyReportKpiPatch = {
  earnedHours: number | null;
  plannedHours: number | null;
  targetHours: number | null;
  earnedPct: number | null;
  planPct: number | null;
  incEarned: number | null;
  phases: Array<{
    code: DailyReportPhaseCode;
    earnedHours: number | null;
    plannedHours: number | null;
    planPct: number | null;
    earnedPct: number | null;
  }>;
};

const PHASE_CODES: DailyReportPhaseCode[] = ["PRE", "SD", "TA", "SU", "POST"];

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if ("result" in rec) return asText(rec.result);
    if (typeof rec.text === "string") return rec.text.replace(/\s+/g, " ").trim();
    if (Array.isArray(rec.richText)) {
      return rec.richText.map((part) => asText((part as { text?: unknown }).text)).join("").trim();
    }
  }
  return "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "result" in (value as object)) {
    return asNumber((value as { result: unknown }).result);
  }
  const text = asText(value).replace(/,/g, "");
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 1 or 100% → 1; 0.45 stays 0.45; 45 → 0.45. */
export function normalizeDailyReportPct(value: unknown): number | null {
  const n = asNumber(value);
  if (n == null || n < 0) return null;
  if (n > 1) return Math.round(Math.min(n, 100) * 100) / 10000;
  return Math.round(n * 10000) / 10000;
}

function headerKey(value: unknown): string {
  return asText(value)
    .toLowerCase()
    .replace(/%/g, " pct")
    .replace(/mhr/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type ColMap = {
  target: number;
  current: number;
  planned: number;
  earned: number;
  planPct: number;
  actualPct: number;
  incActual: number;
};

const POSITIONAL: ColMap = {
  target: 3,
  current: 5,
  planned: 7,
  earned: 8,
  planPct: 9,
  actualPct: 10,
  incActual: 13,
};

function classifyHeader(key: string): keyof ColMap | "phase" | null {
  if (!key) return null;
  if (key === "phase") return "phase";
  if (key.includes("inc") && (key.includes("actual") || key.includes("earned"))) return "incActual";
  if (key.includes("plan") && key.includes("pct")) return "planPct";
  if ((key.includes("actual") || key.includes("earned")) && key.includes("pct")) return "actualPct";
  if (key === "earned" || key === "earned mhr" || (key.includes("earned") && !key.includes("pct") && !key.includes("inc"))) {
    return "earned";
  }
  if (key.includes("planned") || key === "plan") return "planned";
  if (key.includes("current")) return "current";
  if (key.includes("target")) return "target";
  return null;
}

function phaseToken(text: string): { code: DailyReportPhaseCode | null; grandTotal: boolean } | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^grand\s*total$/i.test(t)) return { code: null, grandTotal: true };
  const code = PHASE_CODES.find((item) => item === t.toUpperCase());
  if (code) return { code, grandTotal: false };
  return null;
}

function cell(grid: unknown[][], row: number, col: number): unknown {
  return grid[row]?.[col];
}

function mapFromHeaderRow(grid: unknown[][], headerRow: number, labelCol: number): ColMap {
  const mapped: Partial<ColMap> = {};
  const row = grid[headerRow] ?? [];
  for (let col = 1; col < row.length || col <= 20; col += 1) {
    if (col === labelCol) continue;
    const kind = classifyHeader(headerKey(cell(grid, headerRow, col)));
    if (kind && kind !== "phase" && mapped[kind] == null) mapped[kind] = col;
  }
  return { ...POSITIONAL, ...mapped };
}

function readRow(grid: unknown[][], row: number, labelCol: number, cols: ColMap, token: { code: DailyReportPhaseCode | null; grandTotal: boolean }): DailyReportPhaseRow {
  return {
    label: asText(cell(grid, row, labelCol)) || (token.grandTotal ? DAILY_REPORT_GRAND_TOTAL : token.code || ""),
    row,
    code: token.code,
    grandTotal: token.grandTotal,
    targetMhr: asNumber(cell(grid, row, cols.target)),
    currentMhr: asNumber(cell(grid, row, cols.current)),
    plannedMhr: asNumber(cell(grid, row, cols.planned)),
    earnedMhr: asNumber(cell(grid, row, cols.earned)),
    planPct: normalizeDailyReportPct(cell(grid, row, cols.planPct)),
    actualPct: normalizeDailyReportPct(cell(grid, row, cols.actualPct)),
    incActual: asNumber(cell(grid, row, cols.incActual)),
  };
}

export function parseDailyReportSummaryGrid(grid: unknown[][], sheet: string = DAILY_REPORT_TOTAL_SHEETS.summary): DailyReportParse {
  const hits: Array<{ row: number; col: number; token: { code: DailyReportPhaseCode | null; grandTotal: boolean } }> = [];
  for (let row = 1; row < grid.length; row += 1) {
    const line = grid[row] ?? [];
    for (let col = 1; col < Math.max(line.length, 6); col += 1) {
      const token = phaseToken(asText(line[col]));
      if (token) hits.push({ row, col, token });
    }
  }
  const phaseHits = hits.filter((hit) => hit.token.code);
  const totalHits = hits.filter((hit) => hit.token.grandTotal);
  if (phaseHits.length < 2 || !totalHits.length) {
    throw new DailyReportParseError();
  }
  const labelCol = phaseHits[0]!.col;
  const sameColPhases = phaseHits.filter((hit) => hit.col === labelCol);
  const sameColTotal =
    totalHits.find((hit) => hit.col === labelCol && hit.row > sameColPhases[0]!.row) ?? totalHits[0];
  if (!sameColTotal || sameColPhases.length < 2) {
    throw new DailyReportParseError();
  }
  const firstPhaseRow = sameColPhases[0]!.row;
  let headerRow = firstPhaseRow - 1;
  for (let row = firstPhaseRow - 1; row >= Math.max(1, firstPhaseRow - 8); row -= 1) {
    const keys = (grid[row] ?? []).map((value) => headerKey(value));
    if (keys.some((key) => classifyHeader(key) === "earned" || classifyHeader(key) === "planned" || classifyHeader(key) === "target")) {
      headerRow = row;
      break;
    }
  }
  const cols = mapFromHeaderRow(grid, headerRow, labelCol);
  const phases = sameColPhases.map((hit) => readRow(grid, hit.row, labelCol, cols, hit.token));
  const grandTotal = readRow(grid, sameColTotal.row, labelCol, cols, sameColTotal.token);
  if (grandTotal.earnedMhr == null && grandTotal.plannedMhr == null && grandTotal.actualPct == null) {
    throw new DailyReportParseError();
  }
  return { sheet, headerRow, grandTotal, phases };
}

export function dailyReportToKpiPatch(parsed: DailyReportParse): DailyReportKpiPatch {
  const gt = parsed.grandTotal;
  return {
    earnedHours: gt.earnedMhr,
    plannedHours: gt.plannedMhr,
    targetHours: gt.targetMhr ?? gt.currentMhr,
    earnedPct: gt.actualPct,
    planPct: gt.planPct,
    incEarned: gt.incActual,
    phases: parsed.phases
      .filter((row): row is DailyReportPhaseRow & { code: DailyReportPhaseCode } => Boolean(row.code))
      .map((row) => ({
        code: row.code,
        earnedHours: row.earnedMhr,
        plannedHours: row.plannedMhr,
        planPct: row.planPct,
        earnedPct: row.actualPct,
      })),
  };
}

function worksheetGrid(ws: ExcelJS.Worksheet): unknown[][] {
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const line: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      line[colNumber] = cell.value;
    });
    grid[rowNumber] = line;
  });
  return grid;
}

function summarySheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  return (
    wb.worksheets.find((sheet) => /^summary$/i.test(sheet.name.trim())) ??
    wb.worksheets.find((sheet) => /summary/i.test(sheet.name))
  );
}

export async function parseDailyReportTotalXlsx(bytes: ArrayBuffer | Uint8Array): Promise<DailyReportParse> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new DailyReportParseError(DAILY_REPORT_READ_ERROR);
  }
  const ws = summarySheet(wb);
  if (!ws) throw new DailyReportParseError();
  return parseDailyReportSummaryGrid(worksheetGrid(ws), ws.name);
}

export function dailyReportPreviewLines(parsed: DailyReportParse): string[] {
  const gt = parsed.grandTotal;
  const pct = (value: number | null) => (value == null ? "—" : `${Math.round(value * 1000) / 10}%`);
  const hrs = (value: number | null) => (value == null ? "—" : value.toLocaleString("en-US"));
  return [
    `${DAILY_REPORT_TOTAL_FILE} · ${parsed.sheet} Phase ${DAILY_REPORT_GRAND_TOTAL}`,
    `Earned Mhr ${hrs(gt.earnedMhr)}`,
    `Planned Mhr ${hrs(gt.plannedMhr)}`,
    `Target Mhr ${hrs(gt.targetMhr ?? gt.currentMhr)}`,
    `Actual % ${pct(gt.actualPct)}`,
    `Plan % ${pct(gt.planPct)}`,
    `Inc Actual ${hrs(gt.incActual)}`,
    `Phases ${parsed.phases.map((row) => row.code).filter(Boolean).join(" / ") || "—"}`,
  ];
}
