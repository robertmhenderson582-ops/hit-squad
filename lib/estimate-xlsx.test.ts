import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, it } from "node:test";
import type { CraftRow } from "./craft-labor.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_EXPORT_BRAND,
  ESTIMATE_EXPORT_CONFIDENTIAL,
  ESTIMATE_EXPORT_ERROR,
  ESTIMATE_EXPORT_PRODUCER,
  ESTIMATE_HOURS_LINE,
  ESTIMATE_SUMMARY_AMOUNT,
  ESTIMATE_SUMMARY_HOURS,
  ESTIMATE_XLSX_SHEETS,
  estimateToXlsx,
  estimateXlsxFilename,
  sheetRef,
} from "./estimate-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";
import { lookupShahanLabor, SHAHAN_NO_RATE_LABEL, shahanCrewCostAmount } from "./shahan-wood-river.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
import { REQUIRED_XLSX_PARTS, buildSheetXml, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

function zipParts(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "est-xlsx-"));
  const file = join(dir, "book.xlsx");
  writeFileSync(file, bytes);
  const listing = execSync(`unzip -l "${file}"`, { encoding: "utf8" });
  return listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/).pop() ?? "")
    .filter((part) => part.includes(".xml") || part.includes(".rels"));
}

function craft(
  id: string,
  position: string,
  hoursPerShift: number,
  extra: Partial<CraftRow> & {
    phaseId?: string;
    start?: string;
    end?: string;
    perDiemPeople?: number;
    otAfter8?: boolean;
    days?: boolean[];
  } = {},
): CraftRow {
  return {
    id,
    position,
    shift: extra.shift ?? "Days",
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    billedAs: extra.billedAs,
    clockOverride: extra.clockOverride ?? "auto",
    laborClassOverride: extra.laborClassOverride ?? null,
    ranges: [
      {
        id: `${id}-rg`,
        start: extra.start ?? "2026-09-01",
        end: extra.end ?? "2026-09-01",
        headcount: extra.ranges?.[0]?.headcount ?? 1,
        nightHeadcount: 0,
        hoursPerShift,
        perDiemPeople: extra.perDiemPeople ?? 1,
        days: extra.days ?? [false, true, true, true, true, true, false],
        otAfter8: extra.otAfter8,
        phaseId: extra.phaseId ?? "mech",
      },
    ],
  };
}

function woodRiverFixture() {
  return {
    title: "Unit 3 mechanical T&M",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    crew: {
      staff: [craft("st-1", "Superintendent 01", 10, { perDiemPeople: 1, otAfter8: false })],
      direct: [craft("dr-1", "Boilermaker Journeyman", 10, { perDiemPeople: 1, otAfter8: true })],
      otAfter8: true,
    },
    schedule: {
      projectStart: "2026-09-01",
      multiUnits: false,
      units: [],
      phases: [
        {
          id: "mech" as const,
          name: "Mechanical Window",
          on: true,
          start: "2026-09-01",
          stop: "2026-09-01",
          daysPerWeek: 5,
          hoursPerDay: 10,
          otAfter8: true,
          sundaysOff: [],
        },
      ],
    },
    jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
    equipment: {
      largeTools: [],
      thirdParty: [
        {
          id: "tp-1",
          item: "450amp diesel welder",
          period: "daily" as const,
          rate: 134,
          freight: 100,
          qty: 1,
          start: "2026-09-01",
          end: "2026-09-01",
        },
      ],
    },
    otherCost: {
      perDiemRate: 0,
      travel: [
        { id: "travel-staff", kind: "staff" as const, source: "crew" as const, headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
        { id: "travel-craft", kind: "craft" as const, source: "crew" as const, headcount: 1, travelers: 0, perMile: 0.5, miles: 0 },
      ],
      misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
    },
  };
}

function rodeoFixture() {
  return {
    title: "Crude unit window",
    client: "Phillips 66",
    site: "Rodeo — Rodeo, CA",
    crew: {
      direct: [craft("rd-1", "BOILERMAKER JOURNEYMAN", 12)],
      otAfter8: true,
    },
    jobMeta: { staffPerDiemRate: 155, craftPerDiemRate: 145, staffMileageRate: 0, craftMileageRate: 0, rateBook: "" },
    equipment: { largeTools: [], thirdParty: [] },
    otherCost: { perDiemRate: 0, travel: [], misc: [] },
  };
}

function sheetOf(sheets: WorkbookSheet[], name: string) {
  return sheets.find((sheet) => sheet.name === name);
}

function cellMap(sheet: WorkbookSheet) {
  return new Map(sheet.cells.map((cell) => [cell.ref, cell]));
}

function colIndex(col: string) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function colName(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function expandRange(from: string, to: string) {
  const a = /^([A-Z]+)(\d+)$/.exec(from);
  const b = /^([A-Z]+)(\d+)$/.exec(to);
  if (!a || !b) return [];
  const refs: string[] = [];
  for (let c = colIndex(a[1]); c <= colIndex(b[1]); c += 1) {
    for (let r = Number(a[2]); r <= Number(b[2]); r += 1) {
      refs.push(`${colName(c)}${r}`);
    }
  }
  return refs;
}

function evaluateWorkbook(sheets: WorkbookSheet[]) {
  const cells = new Map<string, SheetCell>();
  for (const sheet of sheets) {
    for (const cell of sheet.cells) cells.set(`${sheet.name}!${cell.ref}`, cell);
  }
  const cache = new Map<string, number>();

  function evalAt(sheet: string, ref: string): number {
    const key = `${sheet}!${ref.replaceAll("$", "")}`;
    if (cache.has(key)) return cache.get(key)!;
    const cell = cells.get(key);
    let value = 0;
    if (cell?.type === "number") value = cell.value;
    else if (cell?.type === "formula") value = evalFormula(sheet, String(cell.value));
    cache.set(key, value);
    return value;
  }

  function evalFormula(sheet: string, raw: string): number {
    let src = raw.replace(/^=/, "").trim();
    const sum = /^SUM\((.+)\)$/.exec(src);
    if (sum) {
      return sum[1].split(",").reduce((acc, part) => {
        const token = part.trim();
        const range = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(token);
        if (range) {
          return acc + expandRange(range[1], range[2]).reduce((sum, ref) => sum + evalAt(sheet, ref), 0);
        }
        const xref = /^(?:'([^']+)'|([A-Za-z0-9]+))!([A-Z]+\d+)$/.exec(token);
        if (xref) return acc + evalAt(xref[1] || xref[2], xref[3]);
        return acc + evalAt(sheet, token);
      }, 0);
    }
    src = src.replace(/'([^']+)'!(\$?[A-Z]+\$?\d+)/g, (_, name, ref) => String(evalAt(name, ref.replaceAll("$", ""))));
    src = src.replace(/\b([A-Za-z][A-Za-z0-9]*)!(\$?[A-Z]+\$?\d+)/g, (_, name, ref) => String(evalAt(name, ref.replaceAll("$", ""))));
    src = src.replace(/\b([A-Z]+)(\d+)\b/g, (_, col, row) => String(evalAt(sheet, `${col}${row}`)));
    if (!/^[-0-9.+*/() e]+$/.test(src)) throw new Error(`uneval ${raw} -> ${src}`);
    return Function(`"use strict"; return (${src});`)() as number;
  }

  return { evalAt };
}

describe("estimate excel export", () => {
  it("writes live formulas and Summary money equals sheet rollups", async () => {
    const input = woodRiverFixture();
    const sheets = buildEstimateWorkbook(input);
    const names = sheets.map((sheet) => sheet.name);
    assert.deepEqual(
      names.includes(ESTIMATE_XLSX_SHEETS.summary),
      true,
    );
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.staff), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.direct), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.rental), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.travel), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.misc), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.rates), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.laydown), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.tension), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.crane), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.coe), false);

    const summary = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary);
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff);
    const direct = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(summary && staff && direct);
    assert.equal(summary.cells.find((cell) => cell.ref === "A1")?.value, ESTIMATE_EXPORT_BRAND);
    assert.equal(summary?.cells.find((cell) => cell.ref === "A5")?.value?.toString().startsWith("Produced"), true);
    assert.match(String(summary.cells.find((cell) => cell.ref === "A2")?.value), new RegExp(ESTIMATE_EXPORT_PRODUCER));
    assert.match(String(summary.cells.find((cell) => cell.ref === "A2")?.value), new RegExp(ESTIMATE_EXPORT_CONFIDENTIAL));
    assert.equal(summary.cells.find((cell) => cell.ref === "B5")?.type, "date");
    assert.match(String(staff.cells.find((cell) => cell.ref === "K7")?.value), /^C7\*G7$/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "G7")?.value), /Rate Tables/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "O8")?.value), /^SUM\(O7:O7\)$/);
    assert.equal(summary.cells.some((cell) => cell.ref === "A7" && cell.value === "Staff labor $"), true);
    assert.equal(summary.cells.some((cell) => cell.ref.startsWith("A") && cell.value === ESTIMATE_HOURS_LINE), true);
    assert.equal(summary.cells.find((cell) => cell.ref === "B6")?.value, ESTIMATE_SUMMARY_AMOUNT);
    assert.equal(summary.cells.find((cell) => cell.ref === "C6")?.value, ESTIMATE_SUMMARY_HOURS);
    assert.equal(staff.cells.find((cell) => cell.ref === "O6")?.value, "Total $");
    assert.equal(staff.cells.find((cell) => cell.ref === "P6")?.value, "MH");

    const { evalAt } = evaluateWorkbook(sheets);
    const amountAt = (label: string) => {
      const row = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${row}`);
    };
    const hoursAt = (label: string) => {
      const row = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `C${row}`);
    };
    const staffLabor = evalAt(ESTIMATE_XLSX_SHEETS.staff, "O8");
    const directLabor = evalAt(ESTIMATE_XLSX_SHEETS.direct, "O8");
    const staffPd = evalAt(ESTIMATE_XLSX_SHEETS.staff, "N8");
    const directPd = evalAt(ESTIMATE_XLSX_SHEETS.direct, "N8");
    const rentalCost = evalAt(ESTIMATE_XLSX_SHEETS.rental, "G8");
    const rentalMarked = evalAt(ESTIMATE_XLSX_SHEETS.rental, "H8");
    const travel = evalAt(ESTIMATE_XLSX_SHEETS.travel, "E8");
    const misc = evalAt(ESTIMATE_XLSX_SHEETS.misc, "E8");
    const markup = amountAt("6.5% markup");
    const grand = amountAt("ESTIMATE TOTAL $");
    assert.equal(staffLabor > 0, true);
    assert.equal(directLabor > 0, true);
    assert.equal(rentalCost, 234);
    assert.equal(rentalMarked, (134 + 100) * 1.06);
    assert.equal(markup, Math.round((234 + 50) * 0.065 * 100) / 100);
    assert.equal(
      Math.round((staffLabor + directLabor + staffPd + directPd + rentalCost + travel + misc + markup) * 100) / 100,
      Math.round(grand * 100) / 100,
    );
    assert.equal(hoursAt(ESTIMATE_HOURS_LINE) > 0, true);
    assert.equal(hoursAt("ESTIMATE TOTAL $"), evalAt(ESTIMATE_XLSX_SHEETS.staff, "P8") + evalAt(ESTIMATE_XLSX_SHEETS.direct, "P8"));

    const staffHours = computeRowHours(input.crew.staff[0], input.site, input.client, true);
    const directHours = computeRowHours(input.crew.direct[0], input.site, input.client, true);
    assert.equal(staffHours.st, 10);
    assert.equal(staffHours.ot, 0);
    assert.equal(directHours.st, 8);
    assert.equal(directHours.ot, 2);
    assert.equal(staffLabor, shahanCrewCostAmount("Superintendent 01", staffHours, wageLookupOpts(input.site)));
    assert.equal(directLabor, shahanCrewCostAmount("Boilermaker Journeyman", directHours, wageLookupOpts(input.site)));
    assert.equal(travel, 28);
    assert.equal(misc, 50);

    const xml = buildSheetXml(staff.cells);
    assert.match(xml, /<f>/);
    const bytes = await estimateToXlsx(input);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    const parts = zipParts(bytes);
    assert.equal(parts.some((part) => part.endsWith("xl/theme/theme1.xml")), true);
    for (const part of REQUIRED_XLSX_PARTS) {
      assert.equal(parts.some((item) => item.endsWith(part) || item === part), true, part);
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const summarySheet = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    assert.ok(summarySheet);
    assert.match(String(summarySheet.getCell("A2").value ?? ""), /Produced by Hit Squad Project Controls/);
    assert.equal(wb.worksheets.some((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.summary), true);
    assert.equal(/nathan|cat 2 pit stop/i.test(JSON.stringify(wb.model)), false);

    const staffSheet = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staffSheet && summarySheet);
    assert.equal(staffSheet.getCell("C7").numFmt, "#,##0.0");
    assert.equal(staffSheet.getCell("K7").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("G7").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("B7").numFmt, "#,##0");
    assert.equal(staffSheet.getCell("F7").numFmt, "#,##0.0");
    let hoursRow = 0;
    let totalRow = 0;
    summarySheet.eachRow((row, rowNumber) => {
      const label = String(row.getCell(1).value ?? "");
      if (label === ESTIMATE_HOURS_LINE) hoursRow = rowNumber;
      if (label === "ESTIMATE TOTAL $") totalRow = rowNumber;
    });
    assert.equal(hoursRow > 0, true);
    assert.equal(totalRow > hoursRow, true);
    assert.equal(summarySheet.getCell(`C${hoursRow}`).numFmt, "#,##0.0");
    assert.equal(summarySheet.getCell(`B${totalRow}`).numFmt, "$#,##0.00");
    assert.equal(/field trial|forgebook|not a release/i.test(JSON.stringify(wb.model)), false);
  });

  it("uses that job's clock and rates, not a Wood River or Nathan gate", () => {
    const rodeo = buildEstimateWorkbook(rodeoFixture());
    const names = rodeo.map((sheet) => sheet.name);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.direct), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.staff), false);
    const direct = sheetOf(rodeo, ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(direct);
    const hours = cellMap(direct);
    assert.equal(hours.get("C7")?.type, "number");
    assert.equal(hours.get("C7")?.value, 8);
    assert.equal(hours.get("D7")?.value, 4);
    assert.equal(hours.get("E7")?.value, 0);
    const billed = lookupShahanLabor("BOILERMAKER JOURNEYMAN", wageLookupOpts("Rodeo — Rodeo, CA"));
    assert.ok(billed?.st);
    const { evalAt } = evaluateWorkbook(rodeo);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, "O8"), 8 * billed.st + 4 * (billed.ot ?? 0));
    assert.match(estimateXlsxFilename(rodeoFixture()), /rodeo/);
    assert.equal(/nathan|cat-2|wood-river/i.test(estimateXlsxFilename(rodeoFixture())), false);
    assert.match(estimateXlsxFilename(woodRiverFixture()), /wood-river/);
    assert.equal(/nathan|cat-2-pit-stop/i.test(estimateXlsxFilename(woodRiverFixture())), false);
    assert.equal(sheetRef("Rate Tables", "C7"), "'Rate Tables'!C7");
    assert.equal(ESTIMATE_EXPORT_ERROR, "Could not export. Try again.");
  });

  it("does not put source workbooks in git and keeps empty sheets omitted", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /estimateToXlsx/);
    assert.match(workspace, /ESTIMATE_EXPORT_ERROR/);
    assert.equal(/nathanboyte|CAT 2 Pit Stop|isNathan/i.test(workspace), false);
    const empty = buildEstimateWorkbook({ title: "Blank", site: "Yates", client: "Georgia Power" });
    assert.deepEqual(empty.map((sheet) => sheet.name), [ESTIMATE_XLSX_SHEETS.summary]);
    assert.equal(empty[0].cells.some((cell) => cell.type === "formula" || (cell.type === "number" && cell.ref === "B8")), true);
  });

  it("writes an Excel-365-safe package for the O&M sub sheet, inch-quotes, and > text", async () => {
    const input = {
      ...woodRiverFixture(),
      equipment: {
        largeTools: [],
        thirdParty: [
          ...(woodRiverFixture().equipment.thirdParty ?? []),
          {
            id: "tp-2",
            item: '20" clam shell',
            period: "daily" as const,
            rate: 50,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
      otherCost: {
        ...woodRiverFixture().otherCost,
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless > 2\"", qty: 2, each: 25 }],
      },
      subcontractor: {
        lines: [{ id: "sub-1", vendor: "O&M Crane", scope: "crane lift", qty: 1, unit: "LS" as const, rate: 1000, affiliate: false }],
        cards: [],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const subName = excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub);
    assert.equal(subName, "OM Crane Subcontractor");
    assert.equal(sheets.some((sheet) => sheet.name === subName), true);
    assert.equal(sheets.some((sheet) => sheet.name.includes("&")), false);
    const summary = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary);
    const subFormula = summary?.cells.find((cell) => cell.type === "formula" && String(cell.value).includes(subName));
    assert.ok(subFormula);
    assert.equal(String(subFormula.value).includes("&amp;"), false);
    assert.equal(sheetRef(ESTIMATE_XLSX_SHEETS.sub, "H11"), `'${subName}'!H11`);

    const bytes = await estimateToXlsx(input);
    const parts = zipParts(bytes);
    assert.equal(parts.some((part) => part.endsWith("xl/theme/theme1.xml")), true);
    assert.equal(parts.some((part) => part.endsWith("xl/sharedStrings.xml")), true);
    assert.equal(parts.some((part) => part.endsWith("xl/styles.xml")), true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const sub = wb.getWorksheet(subName);
    assert.ok(sub);
    assert.equal(String(sub.getCell("A7").value), "O&M Crane");
    const rental = wb.getWorksheet(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.rental));
    assert.ok(rental);
    assert.equal(String(rental.getCell("A8").value), '20" clam shell');
    const misc = wb.getWorksheet(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.misc));
    assert.ok(misc);
    assert.match(String(misc.getCell("B7").value), /Stainless > 2"/);
    const { evalAt } = evaluateWorkbook(sheets);
    const subTotal = evalAt(subName, "H8");
    assert.equal(subTotal, 1000 * 1.065);
  });

  it("resolves ambiguous Shahan titles the same way the desk does and never writes a fake $0 rate", () => {
    assert.equal(lookupShahanLabor("Lead Safety 01"), null);
    const merit = lookupShahanLabor("Lead Safety 01", { laborClass: "Merit" });
    const union = lookupShahanLabor("Lead Safety 01", { laborClass: "Union" });
    assert.equal(merit?.st, 91.02);
    assert.equal(union?.st, 127.36);
    assert.equal(defaultLaborClass("Lead Safety 01"), "Merit");

    const site = "Wood River — Roxana, IL";
    const meritRow = craft("st-merit", "Lead Safety 01", 10);
    const unionRow = craft("st-union", "Lead Safety 01", 10, { laborClassOverride: "Union" });
    const noneRow = craft("sup-1", "Fire Watch", 10);
    const sheets = buildEstimateWorkbook({
      title: "Aromatics staff rates",
      client: "Phillips 66",
      site,
      crew: {
        staff: [meritRow, unionRow],
        support: [{ ...noneRow, billedAs: "" }],
      },
    });
    const rates = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.rates);
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff);
    const support = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.support);
    assert.ok(rates && staff && support);
    const rateMap = cellMap(rates);
    const staffMap = cellMap(staff);
    const supportMap = cellMap(support);
    assert.equal(rateMap.get("A7")?.value, "Lead Safety 01 · Merit");
    assert.equal(rateMap.get("A8")?.value, "Lead Safety 01 · Union");
    assert.equal(rateMap.get("C7")?.type, "number");
    assert.equal(rateMap.get("C7")?.value, 91.02);
    assert.equal(rateMap.get("C8")?.value, 127.36);
    assert.equal(rateMap.get("B7")?.value, 52.5);
    assert.equal(rateMap.get("A9")?.value, "Fire Watch");
    assert.equal(rateMap.get("C9")?.type, "text");
    assert.equal(rateMap.get("C9")?.value, SHAHAN_NO_RATE_LABEL);
    assert.equal(rateMap.get("C9")?.value === 0, false);

    assert.match(String(staffMap.get("G7")?.value), /Rate Tables.*C7/);
    assert.match(String(staffMap.get("G8")?.value), /Rate Tables.*C8/);
    assert.equal(supportMap.get("G7")?.type, "text");
    assert.equal(supportMap.get("G7")?.value, SHAHAN_NO_RATE_LABEL);
    assert.equal(supportMap.get("K7"), undefined);

    const { evalAt } = evaluateWorkbook(sheets);
    const hours = computeRowHours(meritRow, site, "Phillips 66");
    assert.equal(hours.st, 10);
    assert.equal(hours.ot, 0);
    assert.equal(staffMap.get("C7")?.value, 10);
    assert.equal(staffMap.get("D7")?.value, 0);
    const round2 = (value: number) => Math.round(value * 100) / 100;
    assert.equal(
      round2(evalAt(ESTIMATE_XLSX_SHEETS.staff, "O7")),
      shahanCrewCostAmount("Lead Safety 01", hours, wageLookupOpts(site, { laborClass: "Merit" })),
    );
    assert.equal(
      round2(evalAt(ESTIMATE_XLSX_SHEETS.staff, "O8")),
      shahanCrewCostAmount("Lead Safety 01", hours, wageLookupOpts(site, { laborClass: "Union" })),
    );
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.support, "O7"), 0);
  });

  it("exports B-1 staff seats on the staff clock, not the East Coast craft clock", () => {
    const site = "Wood River — Roxana, IL";
    const client = "Phillips 66";
    const weekday = {
      start: "2026-09-01",
      end: "2026-09-01",
      otAfter8: false as const,
    };
    const sheets = buildEstimateWorkbook({
      title: "Aromatics clocks",
      client,
      site,
      crew: {
        staff: [
          craft("ls", "Lead Site 01", 10, weekday),
          craft("safe", "Lead Safety 01", 10, weekday),
          craft("qa", "COORDINATOR QA-QC 1", 10, weekday),
          craft("doc", "Clerk Document 01", 10, weekday),
          craft("off", "Manager Office 01", 10, weekday),
          craft("tk", "Clerk Timekeeper 01", 10, weekday),
          craft("comp", "Lead Site 01", 10, { ...weekday, clockOverride: "comp", otAfter8: true }),
        ],
        generalForeman: [craft("gf", "Pipefitter GF Union", 10, { ...weekday, otAfter8: true })],
        otAfter8: true,
      },
    });
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff);
    const foremen = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.foremen);
    assert.ok(staff && foremen);
    const staffMap = cellMap(staff);
    const gfMap = cellMap(foremen);
    for (const row of [7, 8, 9, 10, 11, 12]) {
      assert.equal(staffMap.get(`C${row}`)?.value, 10, `staff ST row ${row}`);
      assert.equal(staffMap.get(`D${row}`)?.value, 0, `staff OT row ${row}`);
    }
    assert.equal(staffMap.get("C13")?.value, 8);
    assert.equal(staffMap.get("D13")?.value, 2);
    assert.equal(gfMap.get("C7")?.value, 8);
    assert.equal(gfMap.get("D7")?.value, 2);

    const saturday = buildEstimateWorkbook({
      title: "Aromatics Saturday",
      client,
      site,
      crew: {
        staff: [
          craft("sat-staff", "Lead Safety 01", 10, {
            start: "2026-09-05",
            end: "2026-09-05",
            days: [false, false, false, false, false, false, true],
            otAfter8: false,
          }),
        ],
        generalForeman: [
          craft("sat-gf", "Pipefitter GF Union", 10, {
            start: "2026-09-05",
            end: "2026-09-05",
            days: [false, false, false, false, false, false, true],
            otAfter8: true,
          }),
        ],
        otAfter8: true,
      },
    });
    const satStaff = cellMap(sheetOf(saturday, ESTIMATE_XLSX_SHEETS.staff)!);
    const satGf = cellMap(sheetOf(saturday, ESTIMATE_XLSX_SHEETS.foremen)!);
    assert.equal(satStaff.get("C7")?.value, 10);
    assert.equal(satStaff.get("D7")?.value, 0);
    assert.equal(satGf.get("C7")?.value, 0);
    assert.equal(satGf.get("D7")?.value, 10);
  });

  it("labels contingency, CBA, M.O.R.E., and 6.5% markup on Summary Amount $ — not in MH", () => {
    const input = {
      ...woodRiverFixture(),
      jobMeta: {
        ...woodRiverFixture().jobMeta,
        laborContingencyPct: 10,
        equipmentContingencyPct: 5,
        subsContingencyPct: 4,
        cbaIncreaseOn: true,
        cbaIncreasePct: 3,
        cbaIncreaseDate: "2026-01-01",
        moreFundPerHour: 2,
      },
      subcontractor: {
        lines: [{ id: "sub-1", vendor: "O&M Crane", scope: "crane lift", qty: 1, unit: "LS" as const, rate: 1000, affiliate: false }],
        cards: [],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const labels = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells
      .filter((cell) => cell.ref.startsWith("A") && cell.type === "text")
      .map((cell) => cell.value);
    assert.ok(labels?.includes("Labor contingency"));
    assert.ok(labels?.includes("Equipment contingency"));
    assert.ok(labels?.includes("Subs contingency"));
    assert.ok(labels?.includes("CBA increase"));
    assert.ok(labels?.includes("M.O.R.E. fund"));
    assert.ok(labels?.includes("6.5% markup"));
    const { evalAt } = evaluateWorkbook(sheets);
    const rowOf = (label: string) => {
      const ref = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref;
      assert.ok(ref, label);
      return ref.replace("A", "");
    };
    const hoursRow = rowOf(ESTIMATE_HOURS_LINE);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${hoursRow}`), 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `C${hoursRow}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${rowOf("Labor contingency")}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${rowOf("6.5% markup")}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `C${rowOf("6.5% markup")}`), 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${rowOf("ESTIMATE TOTAL $")}`) > 0, true);
  });

  it("builds a CAT 2-shaped package and keeps FIELD TRIAL / Forgebook off the client file", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const craftWeek = { ...weekday, otAfter8: true as const };
    const input = {
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("st-1", "Lead Safety 01", 10, { ...weekday, otAfter8: false })],
        generalForeman: [craft("gf-1", "Pipefitter GF Union", 10, craftWeek)],
        foreman: [craft("fm-1", "Boilermaker Foreman", 10, craftWeek)],
        direct: [craft("dr-1", "Boilermaker Journeyman", 10, craftWeek)],
        support: [craft("su-1", "Fire Watch", 10, { ...craftWeek, billedAs: "Boilermaker Journeyman" })],
        otAfter8: true,
      },
      schedule: woodRiverFixture().schedule,
      orgChart: { names: {}, parents: {} },
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
      equipment: {
        largeTools: [
          {
            id: "lt-1",
            itemId: "air-mover",
            period: "daily" as const,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-r",
            item: "450amp diesel welder",
            period: "daily" as const,
            rate: 134,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
          {
            id: "tp-t",
            item: "Hydraulic tensioner",
            period: "daily" as const,
            rate: 80,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
          {
            id: "tp-c",
            item: "Carry deck crane",
            period: "daily" as const,
            rate: 400,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff" as const, source: "crew" as const, headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
        ],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 1, each: 25 }],
      },
      subcontractor: {
        lines: [{ id: "sub-1", vendor: "O&M Crane", scope: "crane lift", qty: 1, unit: "LS" as const, rate: 500, affiliate: false }],
        cards: [],
      },
    };
    const withLaydown = {
      ...input,
      crew: {
        ...input.crew,
        support: [
          ...input.crew.support,
          craft("ld-1", "Laydown Pipefitter Foreman", 10, craftWeek),
        ],
      },
    };
    const sheets = buildEstimateWorkbook(withLaydown);
    const names = sheets.map((sheet) => sheet.name);
    assert.equal(names.length, 16);
    assert.equal(names[0], ESTIMATE_XLSX_SHEETS.summary);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.laydown), true);
    assert.equal(names.includes(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub)), true);
    assert.equal(names.some((name) => name.includes("&")), false);
    const blob = JSON.stringify(sheets);
    assert.equal(/field trial|forgebook|not a release/i.test(blob), false);

    const bytes = await estimateToXlsx(withLaydown);
    const parts = zipParts(bytes);
    for (const part of REQUIRED_XLSX_PARTS) {
      assert.equal(parts.some((item) => item.endsWith(part) || item === part), true, part);
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    assert.equal(wb.worksheets.length, 16);
    assert.ok(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary)?.headerFooter.oddHeader?.includes("HIT SQUAD"));
    assert.equal(/field trial|forgebook/i.test(String(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary)?.headerFooter.oddHeader)), false);
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getCell("C7").value, 10);
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getCell("D7").value, 0);
    const rates = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(rates);
    assert.equal(Number(rates.getCell("C7").value) > 0, true);
  });

  it("keeps an unrecognized Staff-card title on the staff clock", () => {
    const sheets = buildEstimateWorkbook({
      title: "Staff clock lane",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("odd", "Turnaround Coordinator Desk", 10, { start: "2026-09-01", end: "2026-09-01", otAfter8: false })],
        otAfter8: true,
      },
    });
    const staff = cellMap(sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff)!);
    assert.equal(staff.get("C7")?.value, 10);
    assert.equal(staff.get("D7")?.value, 0);
  });
});
