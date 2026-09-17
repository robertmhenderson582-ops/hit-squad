import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_OH_PROFIT_SHARE,
  ANALYTICS_PHASE1_LINES,
  ANALYTICS_PHASE2_NOTE,
  ANALYTICS_TAB_ID,
  ANALYTICS_TAB_LABEL,
  ANALYTICS_TOOL_PROFIT_SHARE,
  YATES_ANALYTICS_BURDEN,
  analyticsBurdenFromCrew,
  analyticsLine,
  analyticsMarkupDollars,
  deriveEstimateAnalytics,
} from "./estimate-analytics.ts";
import { deskPackageBreakdown, deskPackageTotal, type DeskPackageInput } from "./estimate-desk-total.ts";
import { boiler17B1FilledSnapshot } from "./wood-river-b1.ts";
import { BOILER17_CLIENT, BOILER17_SITE } from "./boiler-17.ts";
import { estimateMarkupDollars } from "./estimate-total.ts";
import { largeToolAmount, thirdPartyCost } from "./equipment-sheet.ts";
import { computeRangeHours } from "./hours-clock.ts";
import { estimateTabIdsForSite } from "./estimate-tabs.ts";
import { lookupCompWageRow } from "./wage-lookup.ts";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const WOOD = { site: "Wood River — Roxana, IL", client: "Phillips 66" };
const WEEK = {
  start: "2026-09-14",
  end: "2026-09-18",
  hoursPerShift: 10,
  headcount: 1,
  nightHeadcount: 0,
  perDiemPeople: 1,
  days: [false, true, true, true, true, true, false],
};

describe("Yates Analytics model", () => {
  it("locks Phase 1 labels to the workbook sheet", () => {
    assert.deepEqual(
      ANALYTICS_PHASE1_LINES.map((row) => row.label),
      [
        "Total Price",
        "Total Hours",
        "Total OH Based off Base Wages",
        "Total Profit Based off Base Wages",
        "Tool",
        "Consumables",
        "PPE",
        "OH",
        "Labor",
        "Markup (MISC. & General Rental)",
        "COE",
        "Subtotal Profit",
        "Margin",
        "Profit Per Work Hour",
      ],
    );
    assert.equal(ANALYTICS_TAB_ID, "analytics");
    assert.equal(ANALYTICS_TAB_LABEL, "Analytics");
    assert.equal(ANALYTICS_TOOL_PROFIT_SHARE, 0.35);
    assert.equal(ANALYTICS_OH_PROFIT_SHARE, 0.25);
    assert.equal(YATES_ANALYTICS_BURDEN.craft.oh, 0.195);
    assert.equal(YATES_ANALYTICS_BURDEN.craft.profit, 0.15);
    assert.equal(YATES_ANALYTICS_BURDEN.staff.oh, 0.17);
    assert.equal(YATES_ANALYTICS_BURDEN.staff.tool, 0.015);
    assert.match(ANALYTICS_PHASE2_NOTE, /Procurement\/Subcontracts/);
  });

  it("uses COMP BW for OH / profit, not billed ST", () => {
    const row = { position: "Boilermaker Journeyman", ranges: [WEEK] };
    const split = computeRangeHours({
      position: row.position,
      site: WOOD.site,
      client: WOOD.client,
      start: WEEK.start,
      end: WEEK.end,
      hoursPerShift: WEEK.hoursPerShift,
      headcount: WEEK.headcount,
      nightHeadcount: WEEK.nightHeadcount,
      days: WEEK.days,
      perDiemPeople: WEEK.perDiemPeople,
      otAfter8: false,
      clockOverride: "auto",
    });
    const hours = split.st + split.ot + split.dt;
    const wage = lookupCompWageRow(row.position, WOOD.site);
    assert.ok(wage && wage.baseSt && wage.st);
    assert.equal(wage.baseSt < wage.st, true);
    const burden = analyticsBurdenFromCrew({ direct: [row] }, WOOD.site, WOOD.client);
    const rates = YATES_ANALYTICS_BURDEN.craft;
    assert.equal(burden.hours, hours);
    assert.equal(burden.baseWageHours, hours);
    assert.equal(burden.oh, Math.round(hours * wage.baseSt * rates.oh * 100) / 100);
    assert.equal(burden.profit, Math.round(hours * wage.baseSt * rates.profit * 100) / 100);
    assert.equal(burden.tool, Math.round(hours * wage.baseSt * rates.tool * 100) / 100);
    const billedOh = Math.round(hours * wage.st * rates.oh * 100) / 100;
    assert.equal(burden.oh < billedOh, true);
  });

  it("shows — for OH / profit / PPE when no priced baseSt exists", () => {
    const sheet = deriveEstimateAnalytics({
      crew: { direct: [{ position: "Unknown Craft Seat", ranges: [WEEK] }] },
      ...WOOD,
    });
    assert.equal(sheet.hasBaseWage, false);
    assert.equal(analyticsLine(sheet, "total-oh-base-wages")?.amount, null);
    assert.equal(analyticsLine(sheet, "total-profit-base-wages")?.amount, null);
    assert.equal(analyticsLine(sheet, "tool")?.amount, null);
    assert.equal(analyticsLine(sheet, "ppe")?.amount, null);
    assert.equal(analyticsLine(sheet, "subtotal-profit")?.amount, null);
    assert.equal(analyticsLine(sheet, "margin")?.amount, null);
    assert.equal(analyticsLine(sheet, "profit-per-work-hour")?.amount, null);
  });

  it("ripples Total Price / Hours / Markup / COE from the live pack", () => {
    const crew = { direct: [{ position: "Boilermaker Journeyman", ranges: [WEEK] }] };
    const coeLine = {
      id: "lt-1",
      itemId: "air-mover",
      period: "daily" as const,
      qty: 1,
      start: WEEK.start,
      end: WEEK.end,
      enteredCost: 0,
      freight: 0,
    };
    const rentalLine = {
      id: "tp-1",
      item: "Scissor lift",
      period: "daily" as const,
      rate: 100,
      freight: 0,
      qty: 1,
      start: WEEK.start,
      end: WEEK.end,
    };
    const equipment = { largeTools: [coeLine], thirdParty: [rentalLine] };
    const otherCost = {
      perDiemRate: 0,
      travel: [],
      misc: [{ id: "m1", item: "Steel", description: "Channel", qty: 2, each: 40 }],
    };
    const input = { crew, equipment, otherCost, ...WOOD };
    const sheet = deriveEstimateAnalytics(input);
    const desk = deskPackageBreakdown(input);
    const hours = analyticsBurdenFromCrew(crew, WOOD.site, WOOD.client).hours;
    assert.equal(analyticsLine(sheet, "total-price")?.amount, deskPackageTotal(input));
    assert.equal(analyticsLine(sheet, "total-hours")?.amount, hours);
    assert.equal(analyticsLine(sheet, "total-price")?.amount, desk.total);
    const markup = analyticsMarkupDollars(input);
    const rental = thirdPartyCost(rentalLine);
    assert.equal(analyticsLine(sheet, "markup")?.amount, markup);
    assert.equal(
      markup,
      estimateMarkupDollars({
        thirdParty: rental,
        misc: 80,
        client: WOOD.client,
        site: WOOD.site,
      }),
    );
    assert.equal(
      markup <
        estimateMarkupDollars({
          subcontractor: 4000,
          thirdParty: rental,
          misc: 80,
          client: WOOD.client,
          site: WOOD.site,
        }),
      true,
    );
    assert.equal(analyticsLine(sheet, "coe")?.amount, largeToolAmount(coeLine));
    const burden = analyticsBurdenFromCrew(crew, WOOD.site, WOOD.client);
    assert.equal(analyticsLine(sheet, "total-oh-base-wages")?.amount, burden.oh);
    assert.equal(analyticsLine(sheet, "total-profit-base-wages")?.amount, burden.profit);
    assert.equal(analyticsLine(sheet, "tool")?.amount, Math.round(burden.tool * ANALYTICS_TOOL_PROFIT_SHARE * 100) / 100);
    assert.equal(analyticsLine(sheet, "oh")?.amount, Math.round(burden.oh * ANALYTICS_OH_PROFIT_SHARE * 100) / 100);
    assert.equal(analyticsLine(sheet, "labor")?.amount, burden.profit);
    const subtotal = analyticsLine(sheet, "subtotal-profit")?.amount;
    assert.ok(subtotal != null && subtotal > 0);
    const price = analyticsLine(sheet, "total-price")?.amount ?? 0;
    assert.equal(analyticsLine(sheet, "margin")?.amount, subtotal / price);
    assert.equal(analyticsLine(sheet, "profit-per-work-hour")?.amount, Math.round((subtotal / hours) * 100) / 100);
    assert.equal(
      sheet.lines.some((line) => /procurement|updated total profit|sales tax|freight on proc/i.test(line.label)),
      false,
    );
  });

  it("staff lane uses STAFF model % — not craft", () => {
    const row = { position: "Lead Site 01", laborClassOverride: "Merit" as const, ranges: [WEEK] };
    const staff = analyticsBurdenFromCrew({ staff: [row] }, WOOD.site, WOOD.client);
    const asCraft = analyticsBurdenFromCrew({ direct: [row] }, WOOD.site, WOOD.client);
    assert.equal(staff.oh < asCraft.oh, true);
    assert.equal(staff.tool < asCraft.tool, true);
    const wage = lookupCompWageRow(row.position, WOOD.site, "Merit");
    assert.ok(wage?.baseSt);
    assert.equal(staff.oh, Math.round(staff.baseWageHours * wage.baseSt * YATES_ANALYTICS_BURDEN.staff.oh * 100) / 100);
  });

  it("fills Phase 1 lines on a Wood River Boiler 17 pack", () => {
    const pack = boiler17B1FilledSnapshot();
    const input: DeskPackageInput = {
      crew: pack.crew as DeskPackageInput["crew"],
      site: pack.site || BOILER17_SITE,
      client: pack.client || BOILER17_CLIENT,
      otherCost: pack.otherCost as DeskPackageInput["otherCost"],
      jobMeta: pack.jobMeta as DeskPackageInput["jobMeta"],
    };
    const sheet = deriveEstimateAnalytics(input);
    const desk = deskPackageBreakdown(input);
    assert.equal(sheet.hasBaseWage, true);
    assert.equal(analyticsLine(sheet, "total-price")?.amount, desk.total);
    assert.equal((analyticsLine(sheet, "total-hours")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "total-oh-base-wages")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "total-profit-base-wages")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "tool")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "ppe")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "subtotal-profit")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "margin")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "profit-per-work-hour")?.amount ?? 0) > 0, true);
    assert.equal(estimateTabIdsForSite(BOILER17_SITE, BOILER17_CLIENT).includes("analytics"), true);
  });
});

describe("Analytics tab wiring", () => {
  it("adds a read-only Analytics tab on the estimate desk", () => {
    const tabs = read("./estimate-tabs.ts");
    const detail = read("../components/EstimateDetail.tsx");
    const fresh = read("../components/NewEstimateForm.tsx");
    const workspace = read("../components/EstimateWorkspace.tsx");
    const desk = read("../components/EstimateAnalyticsDesk.tsx");
    const rail = read("../components/EstimateTotalRail.tsx");
    const total = read("./estimate-total.ts");
    const deskTotal = read("./estimate-desk-total.ts");
    assert.match(tabs, /id: "analytics"/);
    assert.match(tabs, /label: "Analytics"/);
    assert.equal(estimateTabIdsForSite("Wood River — Roxana, IL", "Phillips 66").includes("analytics"), true);
    assert.equal(estimateTabIdsForSite("Yates", "Georgia Power").includes("analytics"), true);
    assert.match(detail, /tab === "analytics"/);
    assert.match(detail, /EstimateAnalyticsDesk/);
    assert.match(fresh, /tab === "analytics"/);
    assert.match(fresh, /EstimateAnalyticsDesk/);
    assert.match(workspace, /item.id === "purchasing" \|\| item.id === "analytics"/);
    assert.match(desk, /deriveEstimateAnalytics/);
    assert.match(desk, /read-only|Read-only|ANALYTICS_LIVE_NOTE/);
    assert.doesNotMatch(desk, /onChange|paper-field|<input|<textarea|<select/);
    assert.doesNotMatch(rail, /deriveEstimateAnalytics|margin/i);
    assert.doesNotMatch(total, /deriveEstimateAnalytics|Analytics/);
    assert.doesNotMatch(deskTotal, /deriveEstimateAnalytics|Analytics/);
    assert.doesNotMatch(rail, /Profit Per Work Hour|Total OH Based off Base Wages/);
    assert.equal(total.includes("Margin"), false);
  });
});
