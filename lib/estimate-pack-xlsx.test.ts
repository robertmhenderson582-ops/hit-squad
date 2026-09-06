import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  estimateJsonToXlsx,
  estimateJsonToXlsxInput,
  deskEstimateTotal,
  estimateWorkbookSummaryTotal,
  packSnapshotToXlsxInput,
} from "./estimate-pack-xlsx.ts";
import { parseIncomingPack } from "./estimate-pack.ts";
import { largeToolAmount, thirdPartyCost } from "./equipment-sheet.ts";
import { deskPackageBreakdown } from "./estimate-desk-total.ts";
import {
  CBA_INCREASE_LABEL,
  EQUIPMENT_CONTINGENCY_LABEL,
  LABOR_CONTINGENCY_LABEL,
  MORE_FUND_LABEL,
  SUBS_CONTINGENCY_LABEL,
  cbaIncreaseDollars,
  hydrateJobMoney,
  moneyAdderLines,
  moreFundDollars,
} from "./estimate-money.ts";
import { commercialMarkupLabel, estimateMarkupDollars } from "./estimate-total.ts";
import { buildEstimateWorkbook, ESTIMATE_XLSX_SHEETS, RATE_TOOLS_SECTION } from "./estimate-xlsx.ts";
import { miscAmount, travelAmount } from "./other-cost.ts";
import { laborDollarsFromCrew, lookupShahanEquipment, perDiemDollarsFromCrew, shahanPeriodRate } from "./shahan-wood-river.ts";
import { subcontractorMarkupBase, subcontractorTotal } from "./subcontractor.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
import { excelSafeSheetName } from "./xlsx-minimal.ts";
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
    assert.equal(fromHelper, Math.round(fromSheets * 100) / 100);
    const bytes = await estimateJsonToXlsx(SAMPLE_PACK);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.equal(bytes.byteLength > 1000, true);
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
    const files = readdirSync("look-samples").filter((file) => file.endsWith(".xlsx") && file.startsWith("v151_")).sort();
    assert.deepEqual(files, ["v151_real_aromatics.xlsx", "v151_real_cat2.xlsx"]);
  });

  it("vault leftover $0 crane / sub / untitled labor rows do not create tabs", () => {
    const leftover = {
      ...SAMPLE_PACK,
      packId: "new-mtleftover-zeros1",
      title: "Leftover zeros",
      crew: {
        staff: SAMPLE_PACK.crew.staff,
        generalForeman: [],
        foreman: [{ id: "fm-empty", position: "", shift: "Days", ranges: [] }],
        direct: [],
        support: [{ id: "sup-empty", position: "   ", shift: "Days", ranges: [] }],
        otAfter8: true,
      },
      equipment: {
        largeTools: [
          {
            id: "lt-empty",
            itemId: "",
            period: "daily",
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-empty",
            item: "",
            period: "daily",
            rate: 0,
            freight: 0,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
          },
          {
            id: "tp-crane-zero",
            item: "Carry deck crane",
            period: "daily",
            rate: 0,
            freight: 0,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff", source: "crew", headcount: 8, travelers: 0, perMile: 0.76, miles: 0 },
        ],
        misc: [{ id: "mc-alloy", item: "Alloy rod", description: "Stainless", qty: 1, each: 0 }],
      },
      subcontractor: {
        lines: [{ id: "sb-empty", vendor: "", scope: "", qty: 1, unit: "LS", rate: 0, affiliate: false }],
        cards: [],
      },
    };
    const { input } = estimateJsonToXlsxInput(leftover);
    const names = buildEstimateWorkbook(input).map((sheet) => sheet.name);
    assert.deepEqual(names, [
      ESTIMATE_XLSX_SHEETS.summary,
      ESTIMATE_XLSX_SHEETS.jobSetup,
      ESTIMATE_XLSX_SHEETS.staff,
      ESTIMATE_XLSX_SHEETS.rates,
      ESTIMATE_XLSX_SHEETS.lists,
      ESTIMATE_XLSX_SHEETS.jobDays,
      ESTIMATE_XLSX_SHEETS.crewRanges,
    ]);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.crane), false);
    assert.equal(names.includes(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub)), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.foremen), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.rental), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.travel), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.misc), false);
  });

  it("live Aromatics and CAT 2 vault packs match desk ESTIMATE TOTAL $", () => {
    const expected = [
      {
        file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json",
        // Screenshot Labor $18,598,972.74 / TOTAL $24,859,836.19 was Excel recalc
        // taking the clock fallback (date lock vs header serial). Desk weekly-40
        // Labor $ is $19,063,808.52 — TOTAL $25,324,671.97. Other buckets already matched.
        total: 25324671.97,
        labor: 19063808.52,
      },
      {
        file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json",
        total: 1435365.66,
      },
    ];
    const penny = (n: number) => Math.round(n * 100) / 100;
    const near = (got: number | null, want: number, label: string, file: string) => {
      if (penny(want) === 0 && (got == null || penny(got) === 0)) return;
      assert.equal(got == null ? null : penny(got), penny(want), `${file} ${label}`);
    };
    for (const { file, total, labor } of expected) {
      if (!existsSync(file)) continue;
      const { input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(file, "utf8")));
      const desk = deskEstimateTotal(input);
      const excel = estimateWorkbookSummaryTotal(input);
      assert.equal(desk, total, file);
      assert.equal(excel, desk, file);
      const sheets = buildEstimateWorkbook(input);
      const breakdown = deskPackageBreakdown(input);
      const site = input.site ?? "";
      const client = input.client ?? "";
      const holidays = hydrateJobMoney(input.jobMeta).holidays;
      const laborAmt = laborDollarsFromCrew(input.crew ?? {}, site, client, wageLookupOpts(site), holidays);
      const pd = perDiemDollarsFromCrew(
        input.crew ?? {},
        {
          staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
          craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
        },
        site,
        client,
        holidays,
      );
      const travel = (input.otherCost?.travel ?? []).reduce((sum, line) => sum + travelAmount(line), 0);
      const misc = (input.otherCost?.misc ?? []).reduce((sum, line) => sum + miscAmount(line), 0);
      const rental = (input.equipment?.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
      const tools = (input.equipment?.largeTools ?? []).reduce((sum, line) => sum + largeToolAmount(line), 0);
      const subCtx = { site, client, otAfter8: Boolean(input.crew?.otAfter8) };
      const subs = subcontractorTotal(input.subcontractor, subCtx);
      const markup = estimateMarkupDollars({
        subcontractor: subcontractorMarkupBase(input.subcontractor, subCtx),
        thirdParty: rental,
        misc,
        client,
        site,
      });
      const money = hydrateJobMoney(input.jobMeta);
      const cba = cbaIncreaseDollars(input.crew ?? {}, money, site, client, wageLookupOpts(site));
      const more = moreFundDollars(input.crew ?? {}, input.jobMeta?.moreFundPerHour ?? null, site, client, holidays);
      const adders = moneyAdderLines({
        labor: laborAmt,
        equipment: tools + rental,
        subcontractor: subs,
        money,
        cbaIncrease: cba,
        moreFund: more,
      });
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Labor $"), laborAmt, "Labor $", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Labor $"), breakdown.lines.find((line) => line.id === "labor")?.amount ?? -1, "Labor $ vs desk", file);
      if (labor != null) near(laborAmt, labor, "desk labor fixture", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Per diem $"), pd, "Per diem $", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Travel $"), travel, "Travel $", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Misc $"), misc, "Misc $", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Equipment rental $"), rental, "Equipment rental $", file);
      if (tools > 0) near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "COE $"), tools, "COE $", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "Subcontractor $"), subs, "Subcontractor $", file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, commercialMarkupLabel(client, site)), markup, commercialMarkupLabel(client, site), file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, CBA_INCREASE_LABEL) ?? 0, cba, CBA_INCREASE_LABEL, file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, LABOR_CONTINGENCY_LABEL) ?? 0, adders.laborContingency, LABOR_CONTINGENCY_LABEL, file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, EQUIPMENT_CONTINGENCY_LABEL) ?? 0, adders.equipmentContingency, EQUIPMENT_CONTINGENCY_LABEL, file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, SUBS_CONTINGENCY_LABEL) ?? 0, adders.subsContingency, SUBS_CONTINGENCY_LABEL, file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, MORE_FUND_LABEL) ?? 0, more, MORE_FUND_LABEL, file);
      near(summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "ESTIMATE TOTAL $"), desk, "ESTIMATE TOTAL $", file);
      const staff = sheets.find((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.staff);
      const hour = staff?.cells.find((cell) => cell.ref === "J10" && cell.type === "formula");
      if (hour) {
        assert.match(String(hour.value), /IFERROR\(/);
        assert.match(String(hour.value), /INT\(/);
      }
      const titleChip = staff?.cells.find((cell) => cell.ref === "J7" && cell.type === "formula");
      if (titleChip) {
        const expr = String(titleChip.value);
        assert.match(expr, /SUM\(J10:/);
        assert.equal(/\+SUM\(/.test(expr), false);
        assert.equal(staff.cells.some((cell) => cell.ref === "J3" && cell.type === "formula"), false);
      }
      const rates = sheets.find((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.rates);
      assert.ok(rates);
      const liveTool = (input.equipment?.largeTools ?? []).find((line) => largeToolAmount(line) > 0);
      if (liveTool) {
        const item = lookupShahanEquipment(liveTool.itemId);
        assert.ok(item, liveTool.itemId);
        assert.equal(rates.cells.some((cell) => cell.type === "text" && cell.value === RATE_TOOLS_SECTION), true);
        assert.equal(rates.cells.some((cell) => cell.type === "text" && cell.value === item.description), true);
        const daily = shahanPeriodRate(item, "daily");
        if (typeof daily === "number" && daily > 0) {
          assert.equal(rates.cells.some((cell) => cell.type === "number" && cell.value === daily), true);
        }
      }
    }
  });

  it("export is a view of the live pack — a Misc change ripples desk and Excel the same way", () => {
    const { input } = estimateJsonToXlsxInput(SAMPLE_PACK);
    const beforeDesk = deskEstimateTotal(input);
    const beforeExcel = estimateWorkbookSummaryTotal(input);
    assert.equal(beforeExcel, beforeDesk);
    const next = {
      ...input,
      otherCost: {
        perDiemRate: input.otherCost?.perDiemRate ?? 0,
        travel: input.otherCost?.travel ?? [],
        misc: [...(input.otherCost?.misc ?? []), { id: "mc-rod", item: "Alloy rod", description: "pack weight", qty: 2, each: 50 }],
      },
    };
    const afterDesk = deskEstimateTotal(next);
    const afterExcel = estimateWorkbookSummaryTotal(next);
    assert.equal(afterExcel, afterDesk);
    assert.equal(Math.round((afterDesk - beforeDesk) * 100) / 100, 106.5);
  });

  it("export source stays wired to desk libs and does not hard-code sample dollars", () => {
    const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));
    const xlsx = readFileSync(here("./estimate-xlsx.ts"), "utf8");
    const pack = readFileSync(here("./estimate-pack-xlsx.ts"), "utf8");
    const chrome = readFileSync(here("./xlsx-exceljs.ts"), "utf8");
    assert.match(xlsx, /miscAmount/);
    assert.match(xlsx, /from "\.\/other-cost\.ts"/);
    assert.match(xlsx, /view of the live estimate pack/);
    assert.match(xlsx, /excel-ripple/);
    assert.match(xlsx, /RETROACTIVE/);
    assert.match(xlsx, /liveJobSetupPhases/);
    assert.match(xlsx, /phaseBarRuns/);
    assert.match(xlsx, /Job setup/);
    assert.match(xlsx, /laborBlockVoidMerges/);
    assert.match(xlsx, /LABOR_BILL_AS_LABEL/);
    assert.match(xlsx, /LABOR_PD_COUNT_LABEL/);
    assert.match(xlsx, /perDiemPeople/);
    assert.match(xlsx, /billedAs/);
    assert.match(xlsx, /LABOR_BLOCK_VOID_COLS/);
    assert.match(xlsx, /LABOR_WEEKDAY_LABELS/);
    assert.match(xlsx, /writeWeekdayRow/);
    assert.match(pack, /one live pack/);
    assert.match(pack, /excel-ripple/);
    assert.match(chrome, /Chrome only/);
    assert.match(chrome, /excel-ripple/);
    assert.match(chrome, /RETROACTIVE/);
    assert.match(chrome, /native Excel column outline/);
    assert.match(chrome, /LABOR_DATE_NUM_FMT/);
    assert.match(chrome, /Hit Squad teal/);
    assert.match(chrome, /no Billable column/);
    assert.match(chrome, /faded worksheet/);
    assert.match(chrome, /addBackgroundImage/);
    assert.equal(/vbaProject|\.xlsm/i.test(chrome), false);
    assert.equal(/from "\.\/other-cost/.test(chrome), false);
    assert.equal(/25324671|1435365/.test(xlsx), false);
    assert.equal(/25324671|1435365/.test(chrome), false);
    const ripple = readFileSync(here("./excel-ripple.ts"), "utf8");
    assert.match(ripple, /RETROACTIVE/);
    assert.match(ripple, /never a parallel book/);
    assert.match(ripple, /Look chrome already shipped/);
    assert.match(ripple, /next Excel compile/);
    assert.match(ripple, /Adjustable Job setup/);
    assert.match(ripple, /view of Job setup only/);
    assert.equal(/25324671|1435365/.test(ripple), false);
  });
});
