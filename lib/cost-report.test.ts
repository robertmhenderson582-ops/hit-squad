import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { blankCraftRow, blankRange } from "./craft-labor.ts";
import { hoursFromCrewRows } from "./crew-hours.ts";
import {
  applyTurnipPaste,
  buildCostCurve,
  costActualsFromPastes,
  costReportHasWork,
  deskBudgetFromPack,
  emptyCostReportBook,
  estimateCurveFromCrew,
  hydrateCostReport,
  latestSnapshotForDate,
  liveCostJobs,
  openCostSnapshot,
  parseTurnipPaste,
  readCostReport,
  saveCostSnapshot,
  writeCostReport,
  COST_REPORT_STORE_PREFIX,
} from "./cost-report.ts";
import { deskPackageBreakdown, deskPackageTotal } from "./estimate-desk-total.ts";
import { computeRangeHours } from "./hours-clock.ts";

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

const WOOD = { client: "Phillips 66", site: "Wood River — Roxana, IL" };

function pipefitterWeek() {
  const row = blankCraftRow();
  row.position = "Pipefitter Journeyman";
  row.shift = "Days";
  row.ranges = [
    {
      ...blankRange(),
      start: "2026-09-01",
      end: "2026-09-04",
      hoursPerShift: 10,
      headcount: 2,
      nightHeadcount: 0,
      days: [false, true, true, true, true, true, false],
    },
  ];
  return row;
}

describe("budget from the live desk pack", () => {
  it("uses deskPackageBreakdown totals and crew hours — not a parallel estimate book", () => {
    const crew = { direct: [pipefitterWeek()], otAfter8: true };
    const input = {
      crew,
      ...WOOD,
      equipment: { largeTools: [], thirdParty: [] },
      otherCost: { perDiemRate: 0, travel: [], misc: [] },
      changeOrders: 0,
    };
    const budget = deskBudgetFromPack(input);
    const desk = deskPackageBreakdown(input);
    assert.equal(budget.total, Math.round(desk.total * 100) / 100);
    assert.equal(budget.total, deskPackageTotal(input));
    assert.equal(budget.hours, hoursFromCrewRows(crew.direct, WOOD.site, WOOD.client));
    assert.ok(budget.hours > 0);
    assert.ok(budget.lines.some((line) => line.id === "labor" && line.amount > 0));
  });
});

describe("Turnip T3 Export 15 / 16 paste", () => {
  it("parses headed Export 15 hours the way Mike pastes them", () => {
    const paste = parseTurnipPaste(
      ["Date\tCraft\tST\tOT\tDT\tHours", "09/01/2026\tPF\t8\t2\t0\t10", "09/02/2026\tPF\t8\t2\t0\t10"].join("\n"),
      "15",
    );
    assert.equal(paste.rows.length, 2);
    assert.equal(paste.rows[0]?.date, "2026-09-01");
    assert.equal(paste.rows[0]?.hours, 10);
    assert.equal(paste.rows[0]?.st, 8);
    assert.equal(paste.rows[0]?.ot, 2);
  });

  it("parses T3 Export 15 ClientActual field names and WO codes", () => {
    const paste = parseTurnipPaste(
      [
        "ChargeCode\tWO_Description\tLaborTotal_ClientActual_Units\tLaborTotal_ClientActual_Dollars\tPD_ClientActual_Dollars\tOther_ClientActual_Units\tTotalDollars_ClientActual",
        "100\tDirect\t20\t2200\t0\t0\t2200",
        "505\tPer Diem\t0\t0\t390\t0\t390",
      ].join("\n"),
      "15",
    );
    assert.equal(paste.rows[0]?.code, "100");
    assert.equal(paste.rows[0]?.hours, 20);
    assert.equal(paste.rows[0]?.dollars, 2200);
    assert.equal(paste.rows[0]?.lane, "direct");
    assert.equal(paste.rows[1]?.pdDollars, 390);
    assert.ok(paste.headers.includes("LaborTotal_ClientActual_Units"));
  });

  it("parses Export 16 dollars", () => {
    const paste = parseTurnipPaste("Date,Craft,Amount\n09/01/2026,PF,$12500.50\n09/02/2026,PF,8000", "16");
    const actuals = costActualsFromPastes({ raw: "", rows: [] }, paste, "2026-09-02");
    assert.equal(actuals.dollars, 20500.5);
    assert.equal(actuals.byDate["2026-09-01"]?.dollars, 12500.5);
  });

  it("counts actuals through a typed US status date", () => {
    const hours = parseTurnipPaste("Date\tHours\n09/01/2026\t10\n09/06/2026\t10", "15");
    const dollars = parseTurnipPaste("Date\tAmount\n09/01/2026\t8000\n09/06/2026\t2000", "16");
    const through = costActualsFromPastes(hours, dollars, "9/5/2026");
    assert.equal(through.hours, 10);
    assert.equal(through.dollars, 8000);
    assert.equal(through.byDate["2026-09-06"], undefined);
  });

  it("does not invent rows from a blank paste", () => {
    assert.deepEqual(parseTurnipPaste("", "15").rows, []);
    assert.equal(costReportHasWork(emptyCostReportBook()), false);
  });
});

describe("dated history snapshots", () => {
  it("saves a new dated snapshot and reopens a prior day", () => {
    let book = applyTurnipPaste(emptyCostReportBook(), "15", "Date\tHours\n09/01/2026\t20");
    book = applyTurnipPaste(book, "16", "Date\tAmount\n09/01/2026\t4000");
    book = { ...book, statusDate: "2026-09-01", notes: "Monday PPR" };
    const budget = deskBudgetFromPack({
      crew: { direct: [pipefitterWeek()] },
      ...WOOD,
    });
    book = saveCostSnapshot(book, budget, 1_000);
    assert.equal(book.snapshots.length, 1);
    assert.equal(book.snapshots[0]?.statusDate, "2026-09-01");
    assert.equal(book.snapshots[0]?.notes, "Monday PPR");
    assert.equal(book.snapshots[0]?.actuals.hours, 20);
    assert.equal(book.snapshots[0]?.actuals.dollars, 4000);
    assert.equal(book.snapshots[0]?.budget.total, budget.total);

    book = applyTurnipPaste(book, "15", "Date\tHours\n09/01/2026\t20\n09/02/2026\t18");
    book = { ...book, statusDate: "2026-09-02", notes: "Tuesday PPR" };
    book = saveCostSnapshot(book, budget, 2_000);
    assert.equal(book.snapshots.length, 2);
    assert.equal(latestSnapshotForDate(book, "2026-09-01")?.notes, "Monday PPR");

    const reopened = openCostSnapshot(book, latestSnapshotForDate(book, "2026-09-01")!.id);
    assert.equal(reopened.statusDate, "2026-09-01");
    assert.equal(reopened.notes, "Monday PPR");
    assert.equal(reopened.export15.rows.length, 1);
    assert.equal(costReportHasWork(reopened), true);
  });

  it("read/write persists the book on the estimate key", () => {
    const store = memoryStore();
    const book = saveCostSnapshot(
      { ...emptyCostReportBook(), statusDate: "2026-09-05", notes: "Pit stop" },
      { total: 100, hours: 10, lines: [] },
      5,
    );
    writeCostReport("new:new-cat2pit", book, store);
    const got = readCostReport("new:new-cat2pit", store);
    assert.equal(got.notes, "Pit stop");
    assert.equal(got.snapshots[0]?.statusDate, "2026-09-05");
    assert.ok(store.getItem(`${COST_REPORT_STORE_PREFIX}new:new-cat2pit`));
  });
});

describe("estimate vs actuals curve", () => {
  it("builds an S-curve from live crew clocks and Turnip hours", () => {
    const estimate = estimateCurveFromCrew({ direct: [pipefitterWeek()] }, WOOD.site, WOOD.client);
    assert.ok(estimate.length >= 4);
    assert.equal(estimate[0]?.date, "2026-09-01");
    assert.equal(estimate[0]?.estHours, 20);
    assert.equal(estimate[0]?.estHeadcount, 2);
    const actuals = costActualsFromPastes(
      parseTurnipPaste("Date\tHours\n09/01/2026\t16\n09/02/2026\t18", "15"),
      { raw: "", rows: [] },
      "2026-09-02",
    );
    const curve = buildCostCurve(estimate, actuals, "2026-09-02");
    assert.equal(curve[0]?.actHours, 16);
    assert.ok(curve[1]?.cumEstHours && curve[1].cumEstHours > curve[0]!.cumEstHours);
    assert.ok(curve[1]?.cumActHours && curve[1].cumActHours > curve[0]!.cumActHours);
  });

  it("East Coast 13h weekday stays 8 ST + 5 OT on the curve — never DT after 12", () => {
    const row = blankCraftRow();
    row.position = "Boilermaker Foreman";
    row.ranges = [
      {
        ...blankRange(),
        start: "2026-09-01",
        end: "2026-09-01",
        hoursPerShift: 13,
        headcount: 1,
        days: [false, true, true, true, true, true, false],
      },
    ];
    const clock = computeRangeHours({
      position: row.position,
      site: WOOD.site,
      client: WOOD.client,
      start: "2026-09-01",
      end: "2026-09-01",
      hoursPerShift: 13,
      headcount: 1,
      days: [false, true, true, true, true, true, false],
    });
    assert.equal(clock.st, 8);
    assert.equal(clock.ot, 5);
    assert.equal(clock.dt, 0);
    const curve = estimateCurveFromCrew({ direct: [row] }, WOOD.site, WOOD.client);
    assert.equal(curve[0]?.estHours, 13);
    assert.equal(clock.dt, 0, "curve must use hours-clock — no DT-after-12 rewrite");
  });
});

describe("hydrate + live job list", () => {
  it("hydrate keeps snapshots and liveCostJobs de-dupes packs", () => {
    const book = saveCostSnapshot(
      { ...emptyCostReportBook(), statusDate: "2026-09-06", notes: "Saturday" },
      { total: 50, hours: 8, lines: [{ id: "labor", label: "Labor", amount: 50 }] },
      9,
    );
    const again = hydrateCostReport(JSON.parse(JSON.stringify(book)));
    assert.equal(again.snapshots[0]?.notes, "Saturday");
    assert.equal(again.snapshots[0]?.budget.lines[0]?.label, "Labor");
    const jobs = liveCostJobs([
      { packId: "new-cat2pit", title: "Cat 2 Pit Stop", client: "Phillips 66", site: "Wood River — Roxana, IL" },
      { packId: "new-cat2pit", title: "dup", client: "Phillips 66", site: "Wood River — Roxana, IL" },
    ]);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.title, "Cat 2 Pit Stop");
  });

  it("Cost report is an on-job estimate tab and /cost reads the live pack", () => {
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const detail = readFileSync(fileURLToPath(new URL("../components/EstimateDetail.tsx", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/CostDesk.tsx", import.meta.url)), "utf8");
    const report = readFileSync(fileURLToPath(new URL("../components/CostReportDesk.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /id: "cost-report"/);
    assert.match(workspace, /label: "Cost report"/);
    assert.match(detail, /tab === "cost-report"/);
    assert.match(desk, /listLocalPacks/);
    assert.match(desk, /CostReportDesk/);
    assert.match(report, /deskBudgetFromPack/);
    assert.match(report, /applyTurnipPaste/);
    assert.match(report, /saveCostSnapshot/);
    assert.match(report, /costReportToXlsx/);
    assert.match(report, /downloadXlsx/);
    assert.match(report, /Excel export/);
    assert.match(report, /company-logo/);
    assert.equal(/DT after 12 rewrite|turn 12s into DT/.test(report), true);
  });
});
