/**
 * Vault / desk estimate JSON → the same EstimateXlsxInput the live Export
 * button builds. No invented crew, dollars, or fixtures. Empty categories
 * stay omitted — leftover $0 catalog rows do not become blank tabs.
 */
import { hydrateSupportLines, syncCraftRows, syncSupportRows, type CraftRow } from "./craft-labor.ts";
import { parseEquipmentSheet } from "./equipment-sheet.ts";
import { parseIncomingPack, type EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_XLSX_SHEETS,
  estimateToXlsx,
  type EstimateXlsxCrew,
  type EstimateXlsxInput,
} from "./estimate-xlsx.ts";
import { parseOtherCostJson, syncOtherCostTravel } from "./other-cost.ts";
import { mergeSchedule, type PhaseScheduleState } from "./phase-schedule.ts";
import { hydrateJobMeta } from "./staffing-plan.ts";
import { normalizeSubSheet, type SubSheet } from "./subcontractor.ts";
import { summaryAmountAt } from "./xlsx-eval.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function crewFromPack(raw: unknown): EstimateXlsxCrew {
  const parsed = asRecord(raw) ?? {};
  return {
    staff: Array.isArray(parsed.staff) ? (parsed.staff as CraftRow[]) : [],
    generalForeman: Array.isArray(parsed.generalForeman) ? (parsed.generalForeman as CraftRow[]) : [],
    foreman: Array.isArray(parsed.foreman) ? (parsed.foreman as CraftRow[]) : [],
    direct: Array.isArray(parsed.direct) ? (parsed.direct as CraftRow[]) : [],
    support: hydrateSupportLines(parsed.support),
    otAfter8: Boolean(parsed.otAfter8),
  };
}

export function syncPackCrew(crew: EstimateXlsxCrew, schedule: PhaseScheduleState): EstimateXlsxCrew {
  const phases = schedule.phases;
  const units = schedule.units ?? [];
  const multi = Boolean(schedule.multiUnits);
  return {
    ...crew,
    staff: syncCraftRows(crew.staff ?? [], phases, units, multi),
    generalForeman: syncCraftRows(crew.generalForeman ?? [], phases, units, multi),
    foreman: syncCraftRows(crew.foreman ?? [], phases, units, multi),
    direct: syncCraftRows(crew.direct ?? [], phases, units, multi),
    support: syncSupportRows(crew.support ?? [], phases, units, multi),
  };
}

/** Same mapping EstimateWorkspace.exportWorkbook uses after the desk hydrates a pack. */
export function packSnapshotToXlsxInput(pack: EstimatePackSnapshot): EstimateXlsxInput {
  const schedule = mergeSchedule(asRecord(pack.schedule) as Partial<PhaseScheduleState> | null);
  const crew = syncPackCrew(crewFromPack(pack.crew), schedule);
  const jobMeta = hydrateJobMeta(asRecord(pack.jobMeta));
  return {
    title: pack.title,
    client: pack.client,
    site: pack.site,
    crew,
    schedule,
    jobMeta,
    equipment: parseEquipmentSheet(pack.equipment),
    otherCost: syncOtherCostTravel(parseOtherCostJson(pack.otherCost), crew, {
      staffPerMile: jobMeta.staffMileageRate,
      craftPerMile: jobMeta.craftMileageRate,
    }),
    subcontractor: normalizeSubSheet(asRecord(pack.subcontractor) as Partial<SubSheet> | null),
  };
}

export function estimateJsonToXlsxInput(raw: unknown): { pack: EstimatePackSnapshot; input: EstimateXlsxInput } {
  const parsed = parseIncomingPack(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return { pack: parsed.pack, input: packSnapshotToXlsxInput(parsed.pack) };
}

export async function estimateJsonToXlsx(raw: unknown): Promise<Uint8Array> {
  return estimateToXlsx(estimateJsonToXlsxInput(raw).input);
}

export function estimateWorkbookSummaryTotal(input: EstimateXlsxInput): number {
  const sheets = buildEstimateWorkbook(input);
  const total = summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "ESTIMATE TOTAL $");
  if (total == null) throw new Error("missing-summary-total");
  return Math.round(total * 100) / 100;
}
