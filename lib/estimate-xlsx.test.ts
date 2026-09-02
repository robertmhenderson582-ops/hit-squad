import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { CraftRow } from "./craft-labor.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_EXPORT_BRAND,
  ESTIMATE_EXPORT_ERROR,
  ESTIMATE_EXPORT_PRODUCER,
  ESTIMATE_XLSX_SHEETS,
  estimateToXlsx,
  estimateXlsxFilename,
  sheetRef,
} from "./estimate-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
import { lookupShahanLabor, shahanCrewCostAmount } from "./shahan-wood-river.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
import { buildSheetXml, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

function craft(
  id: string,
  position: string,
  hoursPerShift: number,
  extra: Partial<CraftRow> & { phaseId?: string; start?: string; end?: string; perDiemPeople?: number; otAfter8?: boolean } = {},
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
        days: [false, true, true, true, true, true, false],
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
  it("writes live formulas and Summary money equals sheet rollups", () => {
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
    assert.equal(summary.cells.find((cell) => cell.ref === "A2")?.value, ESTIMATE_EXPORT_PRODUCER);
    assert.match(String(staff.cells.find((cell) => cell.ref === "K7")?.value), /^C7\*G7$/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "G7")?.value), /Rate Tables/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "O8")?.value), /^SUM\(O7:O7\)$/);
    const summaryFormulas = summary.cells.filter((cell) => cell.type === "formula");
    assert.equal(summaryFormulas.length > 0, true);
    assert.equal(summary.cells.some((cell) => cell.ref.startsWith("B") && cell.type === "number" && cell.value > 0), false);

    const { evalAt } = evaluateWorkbook(sheets);
    const amountAt = (label: string) => {
      const row = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${row}`);
    };
    const staffLabor = evalAt(ESTIMATE_XLSX_SHEETS.staff, "O8");
    const directLabor = evalAt(ESTIMATE_XLSX_SHEETS.direct, "O8");
    const staffPd = evalAt(ESTIMATE_XLSX_SHEETS.staff, "N8");
    const directPd = evalAt(ESTIMATE_XLSX_SHEETS.direct, "N8");
    const rental = evalAt(ESTIMATE_XLSX_SHEETS.rental, "H8");
    const travel = evalAt(ESTIMATE_XLSX_SHEETS.travel, "E8");
    const misc = evalAt(ESTIMATE_XLSX_SHEETS.misc, "E8");
    const grand = amountAt("ESTIMATE TOTAL");
    assert.equal(staffLabor > 0, true);
    assert.equal(directLabor > 0, true);
    assert.equal(Math.round((staffLabor + directLabor + staffPd + directPd + rental + travel + misc) * 100) / 100, Math.round(grand * 100) / 100);

    const staffHours = computeRowHours(input.crew.staff[0], input.site, input.client, true);
    const directHours = computeRowHours(input.crew.direct[0], input.site, input.client, true);
    assert.equal(staffHours.st, 10);
    assert.equal(staffHours.ot, 0);
    assert.equal(directHours.st, 8);
    assert.equal(directHours.ot, 2);
    assert.equal(staffLabor, shahanCrewCostAmount("Superintendent 01", staffHours, wageLookupOpts(input.site)));
    assert.equal(directLabor, shahanCrewCostAmount("Boilermaker Journeyman", directHours, wageLookupOpts(input.site)));
    assert.equal(rental, (134 + 100) * 1.06);
    assert.equal(travel, 28);
    assert.equal(misc, 50);

    const xml = buildSheetXml(staff.cells);
    assert.match(xml, /<f>/);
    const bytes = estimateToXlsx(input);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    const asText = new TextDecoder().decode(bytes);
    assert.match(asText, /Produced by Hit Squad Project Controls/);
    assert.match(asText, /Summary Page/);
    assert.match(asText, /<f>/);
    assert.equal(/nathan|cat 2 pit stop/i.test(asText), false);
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
});
