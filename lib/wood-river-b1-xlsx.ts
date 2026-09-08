/**
 * Official RH B-1 workbook parse. ExcelJS only — not imported by the wake
 * / HIS client path. Desk upload loads this module on demand.
 */
import ExcelJS from "exceljs";
import {
  b1LaneFor,
  classicB1LaborSheet,
  compressB1Plugs,
  ingestFromFixture,
  loadBoiler17B1Fixture,
  typedHoursFromPositions,
  WOOD_RIVER_B1_DATE_COL,
  WOOD_RIVER_B1_WINDOW_END,
  WOOD_RIVER_B1_WINDOW_START,
  type B1FixturePosition,
  type Boiler17B1Hours,
  type WoodRiverB1Fixture,
  type WoodRiverB1Ingest,
} from "./wood-river-b1.ts";
import { formatYmd, parseYmd } from "./phase-schedule.ts";
import { OFFICIAL_BOILER17_B1_REVISION_ID, OFFICIAL_BOILER17_B1_REVISION_NAME } from "./work-folder.ts";

function asNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !value.trim().startsWith("=")) {
    const next = Number(value.replace(/[$,]/g, "").trim());
    return Number.isFinite(next) ? next : 0;
  }
  if (value && typeof value === "object" && "result" in value) return asNum((value as { result: unknown }).result);
  return 0;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && "result" in value) return asText((value as { result: unknown }).result);
  return "";
}

function cellYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatYmd(value);
  if (typeof value === "number" && value > 30000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return formatYmd(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return "";
}

function ymdAdd(start: string, days: number) {
  const date = parseYmd(start);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

function laborDates(ws: ExcelJS.Worksheet): string[] {
  for (const row of [6, 5, 1]) {
    const first = cellYmd(ws.getCell(row, WOOD_RIVER_B1_DATE_COL).value);
    if (first) {
      return Array.from({ length: 119 }, (_, index) => ymdAdd(first, index)).filter(Boolean);
    }
  }
  return Array.from({ length: 119 }, (_, index) => ymdAdd(WOOD_RIVER_B1_WINDOW_START, index)).filter(Boolean);
}

function nightAfterRow(ws: ExcelJS.Worksheet, stRow: number) {
  for (let row = 1; row <= stRow; row += 1) {
    const label = asText(ws.getCell(row, 3).value).replace(/\s+/g, "");
    if (/nightshift/i.test(label)) return true;
  }
  return false;
}

function parseLaborSheet(ws: ExcelJS.Worksheet, sheet: "staff" | "foremen" | "direct" | "support"): B1FixturePosition[] {
  const dates = laborDates(ws);
  const positions: B1FixturePosition[] = [];
  const last = Math.max(ws.rowCount || 7, 7);
  for (let row = 7; row <= last; row += 1) {
    if (asText(ws.getCell(row, 7).value).toUpperCase() !== "ST") continue;
    const title = asText(ws.getCell(row, 3).value);
    const hcRow = row - 2;
    const hpsRow = row - 1;
    const pdRow = row + 3;
    const plugs: Array<{ ymd: string; hc: number; hps: number; pd: number }> = [];
    let hours = 0;
    let pdDays = 0;
    dates.forEach((ymd, index) => {
      const col = WOOD_RIVER_B1_DATE_COL + index;
      const hc = asNum(ws.getCell(hcRow, col).value);
      const hps = asNum(ws.getCell(hpsRow, col).value);
      const pd = asNum(ws.getCell(pdRow, col).value);
      if (hc > 0 || pd > 0) {
        plugs.push({ ymd, hc, hps, pd });
        hours += hc * hps;
        pdDays += pd;
      }
    });
    if (!plugs.length) continue;
    const nameRaw = asText(ws.getCell(row + 4, 3).value);
    const name = nameRaw.startsWith("=") ? "" : nameRaw;
    positions.push({
      sheet,
      lane: b1LaneFor(sheet, title),
      position: title || "Empty",
      night: nightAfterRow(ws, row),
      name,
      ranges: compressB1Plugs(plugs),
      hours,
      pdDays,
    });
  }
  return positions;
}

function parseSummaryHours(ws: ExcelJS.Worksheet | undefined): Boiler17B1Hours | null {
  if (!ws) return null;
  const directHours = asNum(ws.getCell("C8").value);
  const foremenHours = asNum(ws.getCell("C9").value);
  const supportHours = asNum(ws.getCell("C10").value);
  const staffHours = asNum(ws.getCell("C17").value);
  if (!directHours && !staffHours) return null;
  return {
    directHours,
    foremenHours,
    supportHours,
    targetCraftHours: directHours + foremenHours + supportHours,
    staffHours,
    craftPerDiem: asNum(ws.getCell("D12").value),
    materials: asNum(ws.getCell("D13").value) || 104100,
    heatInduction: asNum(ws.getCell("D15").value),
    staffPerDiem: asNum(ws.getCell("D18").value),
    staffTravel: asNum(ws.getCell("D20").value),
  };
}

export async function ingestWoodRiverB1(bytes: Uint8Array, fileName = ""): Promise<WoodRiverB1Ingest> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const positions: B1FixturePosition[] = [];
  for (const ws of wb.worksheets) {
    const sheet = classicB1LaborSheet(ws.name);
    if (!sheet) continue;
    positions.push(...parseLaborSheet(ws, sheet));
  }
  const summary =
    parseSummaryHours(wb.worksheets.find((sheet) => /summary/i.test(sheet.name))) ?? loadBoiler17B1Fixture().summaryHours;
  const fixture: WoodRiverB1Fixture = {
    extractedFrom: "drive-text",
    officialRevisionId: OFFICIAL_BOILER17_B1_REVISION_ID,
    officialRevisionName: fileName || OFFICIAL_BOILER17_B1_REVISION_NAME,
    window: { start: WOOD_RIVER_B1_WINDOW_START, end: WOOD_RIVER_B1_WINDOW_END },
    summaryHours: summary,
    typedHours: typedHoursFromPositions(positions),
    misc: loadBoiler17B1Fixture().misc,
    positions,
  };
  return ingestFromFixture(fixture);
}
