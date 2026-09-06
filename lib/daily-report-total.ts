/**
 * Schema for 01 DailyReport_TOTAL — the scheduler file Hit Squad uses for
 * Cost report Schedule / Progress (and later Slicer).
 *
 * Drive baseline (do not commit the book): Copy of 01 DailyReport_TOTAL - Baseline.xlsx
 * This module is headers / sheet names / phase map only. No P66 numbers.
 *
 * Upload of DailyReport_TOTAL is parked. Day-1 types the Summary Phase Grand
 * Total KPIs by hand. When upload lands it will fill the same fields from
 * Summary Phase Grand Total (or a selected Area).
 */
import type { PhaseId } from "./phase-schedule.ts";

export const DAILY_REPORT_TOTAL_FILE = "01 DailyReport_TOTAL";
export const DAILY_REPORT_TOTAL_BASELINE = "Copy of 01 DailyReport_TOTAL - Baseline.xlsx";

export const DAILY_REPORT_TOTAL_SHEETS = {
  summary: "Summary",
  companyExpense: "Company Expense",
  equip: "Equip",
} as const;

export const DAILY_REPORT_TOTAL_KPI_COLUMNS = [
  "Target Mhr",
  "SCR Mhr",
  "Current Mhr",
  "Remain Mhr",
  "Planned Mhr",
  "Earned Mhr",
  "Plan %",
  "Earned % / Actual %",
  "Inc SCR",
  "Inc Plan",
  "Inc Earned",
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
  { id: "earnedPct", column: "Earned % / Actual %" },
] as const;

export const DAILY_REPORT_UPLOAD_NOTE =
  "Upload of 01 DailyReport_TOTAL will eventually fill these from Summary Phase Grand Total (or a selected Area). Type them for Day-1. Slicer stays parked until that upload exists.";

export function dailyReportPhaseId(code: string): PhaseId | null {
  const key = code.trim().toUpperCase();
  return DAILY_REPORT_PHASES.find((row) => row.code === key)?.phaseId ?? null;
}

export function dailyReportPhaseCode(phaseId: PhaseId): DailyReportPhaseCode | null {
  return DAILY_REPORT_PHASES.find((row) => row.phaseId === phaseId)?.code ?? null;
}
