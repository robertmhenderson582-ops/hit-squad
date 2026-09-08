/**
 * Official Madison U110 contractor R1 workbook parse. ExcelJS only — not
 * imported by the wake / desk seed path. Upload loads this module on demand.
 */
import ExcelJS from "exceljs";
import {
  ingestRodeoU110FromFixture,
  loadRodeoU110Fixture,
  madisonContractorLaborSheet,
  madisonLaneFor,
  typedHoursFromMadisonPositions,
  type MadisonFixturePosition,
  type MadisonSheet,
  type MadisonU110Fixture,
  type MadisonU110Ingest,
} from "./madison-u110.ts";
import { U110_CONTRACTOR_GOLDEN } from "./wake-golden.ts";
import { OFFICIAL_U110_REVISION_ID, OFFICIAL_U110_REVISION_NAME } from "./work-folder.ts";

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

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function parseLaborSheet(ws: ExcelJS.Worksheet, sheet: MadisonSheet): MadisonFixturePosition[] {
  const positions: MadisonFixturePosition[] = [];
  const last = Math.max(ws.rowCount || 9, 9);
  const titleCol = sheet === "direct" ? 3 : 2;
  const hoursCol = sheet === "direct" ? 4 : 3;
  const rateCol = sheet === "direct" ? 5 : 4;
  for (let row = 9; row <= last; row += 1) {
    const title = asText(ws.getCell(row, titleCol).value);
    const hours = asNum(ws.getCell(row, hoursCol).value);
    const bookRate = asNum(ws.getCell(row, rateCol).value);
    if (!title || hours <= 0) continue;
    positions.push({
      sheet,
      lane: madisonLaneFor(sheet, title),
      position: title,
      hours,
      bookRate,
      bookAmount: money(hours * bookRate),
    });
  }
  return positions;
}

export async function ingestMadisonU110(bytes: Uint8Array, fileName = ""): Promise<MadisonU110Ingest> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const positions: MadisonFixturePosition[] = [];
  for (const ws of wb.worksheets) {
    const sheet = madisonContractorLaborSheet(ws.name);
    if (!sheet) continue;
    positions.push(...parseLaborSheet(ws, sheet));
  }
  const locked = loadRodeoU110Fixture();
  const fixture: MadisonU110Fixture = {
    extractedFrom: "official-xlsx",
    officialRevisionId: OFFICIAL_U110_REVISION_ID,
    officialRevisionName: fileName || OFFICIAL_U110_REVISION_NAME,
    hoursPlugDate: locked.hoursPlugDate,
    hoursPlugNote: locked.hoursPlugNote,
    summaryBuckets: U110_CONTRACTOR_GOLDEN.buckets ?? locked.summaryBuckets,
    typedHours: typedHoursFromMadisonPositions(positions),
    jobMeta: locked.jobMeta,
    misc: locked.misc,
    positions,
    findings: locked.findings,
  };
  return ingestRodeoU110FromFixture(fixture);
}
