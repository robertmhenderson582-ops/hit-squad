import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  estimateJsonToXlsx,
  estimateJsonToXlsxInput,
  estimateWorkbookSummaryTotal,
  packSnapshotToXlsxInput,
} from "./estimate-pack-xlsx.ts";
import { parseIncomingPack } from "./estimate-pack.ts";
import { buildEstimateWorkbook, ESTIMATE_XLSX_SHEETS, estimateToXlsx } from "./estimate-xlsx.ts";
import { summaryAmountAt } from "./xlsx-eval.ts";

const SAMPLE_PACK = {
  packId: "new-mtfixture-pack01",
  key: "new:new-mtfixture-pack01",
  title: "Unit 3 mechanical T&M",
  client: "Phillips 66",
  site: "Wood River — Roxana, IL",
  siteId: "site-madison",
  createdAt: 1,
  updatedAt: 1,
  ownerEmail: "tester@example.com",
  schedule: {
    projectStart: "2026-09-01",
    multiUnits: false,
    units: [],
    phases: [
      {
        id: "mech",
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
  crew: {
    staff: [
      {
        id: "st-1",
        position: "Superintendent 01",
        shift: "Days",
        ranges: [
          {
            id: "rg-st",
            phaseId: "mech",
            start: "2026-09-01",
            end: "2026-09-01",
            headcount: 1,
            hoursPerShift: 10,
            perDiemPeople: 1,
            days: [false, true, true, true, true, true, false],
            otAfter8: false,
          },
        ],
      },
    ],
    direct: [
      {
        id: "dr-1",
        position: "Boilermaker Journeyman",
        shift: "Days",
        ranges: [
          {
            id: "rg-dr",
            phaseId: "mech",
            start: "2026-09-01",
            end: "2026-09-01",
            headcount: 1,
            hoursPerShift: 10,
            perDiemPeople: 1,
            days: [false, true, true, true, true, true, false],
            otAfter8: true,
          },
        ],
      },
    ],
    otAfter8: true,
  },
  jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
  equipment: {
    largeTools: [],
    thirdParty: [
      {
        id: "tp-1",
        item: "450amp diesel welder",
        period: "daily",
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
      { id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
    ],
    misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
  },
  subcontractor: { lines: [], cards: [] },
};

describe("estimate pack JSON → xlsx", () => {
  it("maps a real pack snapshot through the production export path without inventing rows", () => {
    const parsed = parseIncomingPack(SAMPLE_PACK);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const input = packSnapshotToXlsxInput(parsed.pack);
    assert.equal(input.title, "Unit 3 mechanical T&M");
    assert.equal(input.client, "Phillips 66");
    assert.equal(input.crew?.staff?.[0]?.position, "Superintendent 01");
    assert.equal(input.crew?.direct?.[0]?.position, "Boilermaker Journeyman");
    assert.equal(input.equipment?.thirdParty?.[0]?.rate, 134);
    assert.equal(input.otherCost?.misc?.[0]?.each, 25);
    assert.equal(input.equipment?.thirdParty?.length, 1);
    assert.equal(input.crew?.staff?.length, 1);
    assert.equal(input.crew?.foreman?.length, 0);
  });

  it("Summary ESTIMATE TOTAL $ matches estimateToXlsx / buildEstimateWorkbook on the same payload", async () => {
    const { pack, input } = estimateJsonToXlsxInput(SAMPLE_PACK);
    assert.equal(pack.packId, "new-mtfixture-pack01");
    const sheets = buildEstimateWorkbook(input);
    const fromSheets = summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "ESTIMATE TOTAL $");
    const fromHelper = estimateWorkbookSummaryTotal(input);
    assert.ok(fromSheets != null && fromSheets > 0);
    assert.equal(fromHelper, fromSheets);
    const bytes = await estimateJsonToXlsx(SAMPLE_PACK);
    const viaExport = await estimateToXlsx(input);
    assert.equal(bytes.byteLength, viaExport.byteLength);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });

  it("CLI writes xlsx from an estimate JSON path", () => {
    const dir = mkdtempSync(join(tmpdir(), "hs-est-xlsx-"));
    const jsonPath = join(dir, "pack.json");
    const xlsxPath = join(dir, "out.xlsx");
    writeFileSync(jsonPath, JSON.stringify(SAMPLE_PACK));
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/estimate-json-to-xlsx.ts", jsonPath, xlsxPath],
      { encoding: "utf8" },
    );
    const report = JSON.parse(stdout) as { packId: string; estimateTotal: number; out: string };
    assert.equal(report.packId, "new-mtfixture-pack01");
    assert.equal(report.estimateTotal > 0, true);
    const bytes = readFileSync(xlsxPath);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.equal(bytes.byteLength > 1000, true);
  });

  it("rejects JSON that is not an estimate pack", () => {
    assert.throws(() => estimateJsonToXlsxInput({ title: "not a pack" }), /Missing package/);
  });

  it("labels Look samples as REAL-ESTIMATE exports, not fixture demos", () => {
    const files = readdirSync("look-samples").filter((file) => file.endsWith(".xlsx")).sort();
    assert.deepEqual(files, ["v151_real_aromatics.xlsx", "v151_real_cat2.xlsx"]);
  });
});
