/**
 * Vault / desk estimate JSON → the same EstimateXlsxInput the live Export
 * button builds. No invented crew, dollars, or fixtures. Empty categories
 * stay omitted — leftover $0 catalog rows do not become blank tabs.
 */
import { hydrateSupportLines, syncCraftRows, syncSupportRows, type CraftRow } from "./craft-labor.ts";
import { equipmentTotals, parseEquipmentSheet, thirdPartyCost } from "./equipment-sheet.ts";
import { parseIncomingPack, type EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_XLSX_SHEETS,
  estimateToXlsx,
  type EstimateXlsxCrew,
  type EstimateXlsxInput,
} from "./estimate-xlsx.ts";
import {
  CBA_INCREASE_LABEL,
  EQUIPMENT_CONTINGENCY_LABEL,
  LABOR_CONTINGENCY_LABEL,
  MORE_FUND_LABEL,
  SUBS_CONTINGENCY_LABEL,
  cbaIncreaseDollars,
  moneyAdderLines,
  moreFundDollars,
} from "./estimate-money.ts";
import { estimateMarkupDollars, estimateTotalBreakdown, signedMoneyLines } from "./estimate-total.ts";
import { parseOtherCostJson, otherCostTotals, syncOtherCostTravel } from "./other-cost.ts";
import { mergeSchedule, type PhaseScheduleState } from "./phase-schedule.ts";
import { laborDollarsFromCrew, perDiemDollarsFromCrew } from "./shahan-wood-river.ts";
import { hydrateJobMeta } from "./staffing-plan.ts";
import { normalizeSubSheet, subcontractorMarkupBase, subcontractorTotal, type SubSheet } from "./subcontractor.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
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

/** Same rollup EstimateTotalRail uses on the desk. */
export function deskEstimateTotal(input: EstimateXlsxInput): number {
  const site = input.site ?? "";
  const client = input.client ?? "";
  const equipment = input.equipment ?? { largeTools: [], thirdParty: [] };
  const other = input.otherCost ?? { perDiemRate: 0, travel: [], misc: [] };
  const thirdCost = (equipment.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
  const tools = equipmentTotals(equipment).largeTools;
  const rest = otherCostTotals({ ...other, perDiemRate: 0 }, 0);
  const rates = {
    staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
    craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
  };
  const perDiem = perDiemDollarsFromCrew(input.crew ?? {}, rates, site, client);
  const subCtx = { site, client, otAfter8: Boolean(input.crew?.otAfter8) };
  const sheet = input.subcontractor;
  const subcontractor = subcontractorTotal(sheet, subCtx);
  const labor = laborDollarsFromCrew(input.crew ?? {}, site, client, wageLookupOpts(site));
  const cba = cbaIncreaseDollars(input.crew ?? {}, input.jobMeta ?? {}, site, client, wageLookupOpts(site));
  const more = moreFundDollars(input.crew ?? {}, input.jobMeta?.moreFundPerHour ?? null, site, client);
  const adders = moneyAdderLines({
    labor,
    equipment: tools + thirdCost,
    subcontractor,
    money: input.jobMeta ?? {},
    cbaIncrease: cba,
    moreFund: more,
  });
  const rail = estimateTotalBreakdown({
    labor,
    equipment: tools + thirdCost,
    subcontractor,
    markup: estimateMarkupDollars({
      subcontractor: subcontractorMarkupBase(sheet, subCtx),
      thirdParty: thirdCost,
      misc: rest.misc,
    }),
    otherCost: rest.total + perDiem,
    changeOrders: 0,
    hours: 0,
    client,
    site,
    extras: signedMoneyLines([
      { id: "labor-contingency", label: LABOR_CONTINGENCY_LABEL, amount: adders.laborContingency },
      { id: "equipment-contingency", label: EQUIPMENT_CONTINGENCY_LABEL, amount: adders.equipmentContingency },
      { id: "subs-contingency", label: SUBS_CONTINGENCY_LABEL, amount: adders.subsContingency },
      { id: "cba-increase", label: CBA_INCREASE_LABEL, amount: adders.cbaIncrease },
      { id: "more-fund", label: MORE_FUND_LABEL, amount: adders.moreFund },
    ]),
  });
  return Math.round(rail.total * 100) / 100;
}
