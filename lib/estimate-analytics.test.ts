import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_OH_PROFIT_SHARE,
  ANALYTICS_PHASE1_LINES,
  ANALYTICS_TAB_ID,
  ANALYTICS_TAB_LABEL,
  ANALYTICS_TOOL_PROFIT_SHARE,
  YATES_ANALYTICS_BURDEN,
  analyticsBurdenFromCrew,
  analyticsBurdenRates,
  analyticsLine,
  analyticsMarkupDollars,
  analyticsRollup,
  deriveEstimateAnalytics,
  lockedAdderBudgets,
  stcDefaultHint,
  yatesStcPpeRate,
  ANALYTICS_STC_PPE_LABEL,
  WR_EAST_BRIDGE_SEED,
  WR_EAST_LOCKED_STC,
  WR_EAST_LOCKED_STC_PER_HOUR,
} from "./estimate-analytics.ts";
import { deskPackageBreakdown, deskPackageTotal, type DeskPackageInput } from "./estimate-desk-total.ts";
import { boiler17B1FilledSnapshot } from "./wood-river-b1.ts";
import { BOILER17_CLIENT, BOILER17_SITE } from "./boiler-17.ts";
import { commercialMarkupRate, estimateMarkupDollars } from "./estimate-total.ts";
import { largeToolAmount, thirdPartyCost } from "./equipment-sheet.ts";
import { computeRangeHours } from "./hours-clock.ts";
import { estimateTabIdsForSite } from "./estimate-tabs.ts";
import { lookupCompWageRow } from "./wage-lookup.ts";
import {
  ANALYTICS_BRIDGE_SEED_NOTE,
  emptyAnalyticsBridge,
  emptyAnalyticsStc,
  emptyJobMoney,
  hydrateAnalyticsBridge,
  hydrateAnalyticsStc,
  hydrateJobMoney,
} from "./estimate-money.ts";
import { emptyJobMeta, hydrateJobMeta } from "./staffing-plan.ts";

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
        ANALYTICS_STC_PPE_LABEL,
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
    assert.equal(yatesStcPpeRate("craft"), 0.0975);
    assert.equal(yatesStcPpeRate("staff"), 0.0575);
    assert.match(read("./estimate-analytics.ts"), /Phase 2 \(omitted\): Procurement\/Subcontracts/);
    assert.equal(stcDefaultHint(), "Craft 9.75% · staff 5.75%");
    assert.doesNotMatch(stcDefaultHint(), /Yates/i);
    assert.deepEqual(emptyJobMoney().analyticsStc, emptyAnalyticsStc());
    assert.deepEqual(emptyJobMeta().analyticsStc, emptyAnalyticsStc());
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
    assert.equal(burden.stcPpe, Math.round(hours * wage.baseSt * yatesStcPpeRate("craft") * 100) / 100);
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
    assert.equal(analyticsLine(sheet, "stc-ppe")?.amount, null);
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
    assert.equal(analyticsLine(sheet, "stc-ppe")?.amount, Math.round(burden.stcPpe * ANALYTICS_TOOL_PROFIT_SHARE * 100) / 100);
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
    assert.equal(staff.stcPpe < asCraft.stcPpe, true);
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
    assert.equal((analyticsLine(sheet, "stc-ppe")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "subtotal-profit")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "margin")?.amount ?? 0) > 0, true);
    assert.equal((analyticsLine(sheet, "profit-per-work-hour")?.amount ?? 0) > 0, true);
    assert.equal(estimateTabIdsForSite(BOILER17_SITE, BOILER17_CLIENT).includes("analytics"), true);
  });

  it("overrides one STC & PPE % from pack jobMeta — dollars = hours × baseSt × %", () => {
    const crew = { direct: [{ position: "Boilermaker Journeyman", ranges: [WEEK] }] };
    const book = deriveEstimateAnalytics({ crew, ...WOOD });
    const bookBurden = analyticsBurdenFromCrew(crew, WOOD.site, WOOD.client);
    const wage = lookupCompWageRow("Boilermaker Journeyman", WOOD.site);
    assert.ok(wage?.baseSt);
    const hours = bookBurden.baseWageHours;
    const base = hours * wage.baseSt;
    assert.equal(analyticsRollup(book, "rollup-stc-ppe")?.amount, Math.round(base * yatesStcPpeRate("craft") * 100) / 100);

    const override = { stcPpePct: 7 };
    const sheet = deriveEstimateAnalytics({ crew, ...WOOD, jobMeta: { analyticsStc: override } });
    const burden = analyticsBurdenFromCrew(crew, WOOD.site, WOOD.client, [], {}, override);
    assert.equal(burden.stcPpe, Math.round(base * 0.07 * 100) / 100);
    assert.equal(analyticsRollup(sheet, "rollup-stc-ppe")?.amount, burden.stcPpe);
    assert.equal(analyticsLine(sheet, "stc-ppe")?.amount, Math.round(burden.stcPpe * ANALYTICS_TOOL_PROFIT_SHARE * 100) / 100);
    assert.equal(sheet.rollups.length, 1);
    assert.equal(burden.stcPpe !== bookBurden.stcPpe, true);
    assert.equal(burden.oh, bookBurden.oh);
    assert.equal(burden.profit, bookBurden.profit);
    assert.equal(analyticsLine(sheet, "total-oh-base-wages")?.amount, bookBurden.oh);
  });

  it("cleared override hydrates back to combined craft/staff STC & PPE", () => {
    const row = { position: "Lead Site 01", laborClassOverride: "Merit" as const, ranges: [WEEK] };
    const staffBook = analyticsBurdenFromCrew({ staff: [row] }, WOOD.site, WOOD.client);
    const staffCleared = analyticsBurdenFromCrew({ staff: [row] }, WOOD.site, WOOD.client, [], {}, {
      stcPpePct: null,
    });
    assert.deepEqual(staffCleared, staffBook);
    const staffOverride = analyticsBurdenFromCrew({ staff: [row] }, WOOD.site, WOOD.client, [], {}, {
      stcPpePct: 9.75,
    });
    assert.equal(staffOverride.stcPpe > staffBook.stcPpe, true);
    assert.equal(analyticsBurdenRates("staff").stcPpe, yatesStcPpeRate("staff"));
    assert.equal(analyticsBurdenRates("direct", { stcPpePct: 4 }).stcPpe, 0.04);
    assert.equal(analyticsBurdenRates("staff", { stcPpePct: 4 }).stcPpe, 0.04);
  });

  it("persists one STC & PPE % and migrates old tool / con / ppe overrides by summing", () => {
    const stored = {
      analyticsStc: { toolPct: 5, consumablesPct: 0, ppePct: 2.75 },
      laborContingencyPct: 3,
    };
    const meta = hydrateJobMeta(stored);
    assert.equal(meta.analyticsStc.stcPpePct, 7.75);
    const again = hydrateJobMeta(JSON.parse(JSON.stringify(meta)) as Record<string, unknown>);
    assert.deepEqual(again.analyticsStc, meta.analyticsStc);
    assert.deepEqual(hydrateJobMoney(JSON.parse(JSON.stringify(meta))).analyticsStc, meta.analyticsStc);
    assert.deepEqual(hydrateAnalyticsStc({ stcPpePct: 8 }), { stcPpePct: 8 });
    assert.deepEqual(hydrateAnalyticsStc({ stcPpePct: 0 }), { stcPpePct: 0 });
    assert.deepEqual(hydrateAnalyticsStc({ toolPct: "", consumablesPct: "nope", ppePct: -1 }), {
      stcPpePct: 0,
    });
    assert.deepEqual(hydrateJobMoney({}).analyticsStc, emptyAnalyticsStc());

    const crew = { direct: [{ position: "Boilermaker Journeyman", ranges: [WEEK] }] };
    const live = deriveEstimateAnalytics({ crew, ...WOOD, jobMeta: meta });
    const hydrated = deriveEstimateAnalytics({ crew, ...WOOD, jobMeta: again });
    assert.deepEqual(hydrated.rollups, live.rollups);
    const book = deriveEstimateAnalytics({ crew, ...WOOD });
    assert.equal(
      (analyticsRollup(live, "rollup-stc-ppe")?.amount ?? 0) < (analyticsRollup(book, "rollup-stc-ppe")?.amount ?? 0),
      true,
    );
  });
});

describe("Analytics COMP / MSA bridge", () => {
  const crew = { direct: [{ position: "Boilermaker Journeyman", ranges: [WEEK] }] };

  it("keeps % of base wage as the book and does not invent lock OH / profit $", () => {
    const sheet = deriveEstimateAnalytics({ crew, ...WOOD });
    const book = deriveEstimateAnalytics({ crew, ...WOOD, jobMeta: { analyticsBridge: emptyAnalyticsBridge() } });
    assert.equal(sheet.bridge.mode, "pct");
    assert.equal(analyticsLine(sheet, "stc-ppe")?.amount, analyticsLine(book, "stc-ppe")?.amount);
    assert.equal(sheet.bridge.bookProfit, analyticsLine(sheet, "subtotal-profit")?.amount);
    assert.equal(WR_EAST_LOCKED_STC.toolPerHour, 0.5);
    assert.equal(WR_EAST_LOCKED_STC.consumablesPerHour, 1.25);
    assert.equal(WR_EAST_LOCKED_STC.ppePerHour, 1.85);
    assert.equal(WR_EAST_LOCKED_STC_PER_HOUR, 3.6);
    assert.equal(emptyAnalyticsBridge().locked.ohPerHour, null);
    assert.equal(emptyAnalyticsBridge().locked.profitPerHour, null);
    assert.equal(hydrateAnalyticsBridge({}).locked.ohPerHour, null);
    assert.equal(hydrateAnalyticsBridge({ locked: { ohPerHour: 13.15, profitPerHour: 6.33 } }).locked.ohPerHour, 13.15);
    const lockedBlank = deriveEstimateAnalytics({
      crew,
      ...WOOD,
      jobMeta: { analyticsBridge: { ...emptyAnalyticsBridge(), mode: "locked" } },
    });
    assert.equal(lockedBlank.bridge.mode, "locked");
    assert.notEqual(analyticsLine(lockedBlank, "total-oh-base-wages")?.amount, null);
    assert.notEqual(analyticsLine(lockedBlank, "total-oh-base-wages")?.amount, 0);
  });

  it("locked mode uses hours × WR East STC $/hr", () => {
    const pct = deriveEstimateAnalytics({ crew, ...WOOD });
    const hours = pct.bridge.hours;
    const locked = deriveEstimateAnalytics({
      crew,
      ...WOOD,
      jobMeta: { analyticsBridge: { ...emptyAnalyticsBridge(), mode: "locked" } },
    });
    const budgets = lockedAdderBudgets(hours, emptyAnalyticsBridge().locked);
    assert.equal(analyticsRollup(locked, "rollup-stc-ppe")?.amount, budgets.stc);
    assert.equal(locked.rollups.length, 1);
    assert.equal(budgets.stc, Math.round(hours * WR_EAST_LOCKED_STC_PER_HOUR * 100) / 100);
    assert.equal(analyticsLine(locked, "stc-ppe")?.amount, Math.round(budgets.stc * ANALYTICS_TOOL_PROFIT_SHARE * 100) / 100);
    assert.equal(locked.bridge.lockedStcPerHour, 3.6);
    assert.equal(locked.bridge.lockedStcBudget, budgets.stc);
    assert.equal(locked.bridge.afterLockedProfit != null, true);
    assert.equal(locked.bridge.bookProfit, pct.bridge.bookProfit);
  });

  it("drag stack updates bridged margin and persists on jobMeta", () => {
    const hours = deriveEstimateAnalytics({ crew, ...WOOD }).bridge.hours;
    const stored = {
      analyticsBridge: {
        mode: "pct" as const,
        locked: emptyAnalyticsBridge().locked,
        erosionPerHour: 1,
        erosionPctOfBw: 0,
        nb: { onboarding: 100, drugDisa: 40, safety920: 25, siteClasses: 10 },
        extraPd: 50,
        jvic: 1000,
      },
    };
    const meta = hydrateJobMeta(stored);
    assert.equal(meta.analyticsBridge.nb.onboarding, 100);
    const again = hydrateJobMeta(JSON.parse(JSON.stringify(meta)) as Record<string, unknown>);
    assert.deepEqual(again.analyticsBridge, meta.analyticsBridge);
    const sheet = deriveEstimateAnalytics({ crew, ...WOOD, jobMeta: again });
    const erosion = sheet.bridge.drags.find((row) => row.id === "erosion")?.amount;
    const nb = sheet.bridge.drags.find((row) => row.id === "nb")?.amount;
    const pd = sheet.bridge.drags.find((row) => row.id === "pd")?.amount;
    const jvic = sheet.bridge.drags.find((row) => row.id === "jvic")?.amount;
    const stc = sheet.bridge.drags.find((row) => row.id === "stc-embed")?.amount;
    assert.equal(erosion, Math.round(hours * 100) / 100);
    assert.equal(nb, 175);
    assert.equal(pd, 50);
    assert.equal(jvic, 65);
    assert.equal((stc ?? 0) !== 0, true);
    assert.equal(sheet.bridge.bridgedProfit != null, true);
    assert.equal((sheet.bridge.bookProfit ?? 0) > (sheet.bridge.bridgedProfit ?? 0), true);
    assert.equal(sheet.bridge.bridgedMargin != null && sheet.bridge.bookMargin != null, true);
    assert.equal((sheet.bridge.bridgedMargin ?? 0) < (sheet.bridge.bookMargin ?? 0), true);
  });

  it("applies Wood River dig seeds when bridge fields are empty and Owner numbers win", () => {
    const seeded = deriveEstimateAnalytics({ crew, ...WOOD });
    const hours = seeded.bridge.hours;
    const nbSeed =
      WR_EAST_BRIDGE_SEED.nb.onboarding +
      WR_EAST_BRIDGE_SEED.nb.drugDisa +
      WR_EAST_BRIDGE_SEED.nb.safety920 +
      WR_EAST_BRIDGE_SEED.nb.siteClasses;
    const jvicSeedDrag = Math.round(WR_EAST_BRIDGE_SEED.jvic * commercialMarkupRate(WOOD.client, WOOD.site) * 100) / 100;
    assert.equal(seeded.bridge.drags.find((row) => row.id === "erosion")?.amount, Math.round(hours * 0.05 * 100) / 100);
    assert.equal(seeded.bridge.drags.find((row) => row.id === "nb")?.amount, Math.round(nbSeed * 100) / 100);
    assert.equal(seeded.bridge.drags.find((row) => row.id === "pd")?.amount, 0);
    assert.equal(seeded.bridge.drags.find((row) => row.id === "jvic")?.amount, jvicSeedDrag);
    assert.equal(hydrateAnalyticsBridge({}).locked.ohPerHour, null);
    assert.equal(hydrateAnalyticsBridge({}).locked.profitPerHour, null);
    assert.equal(hydrateAnalyticsBridge({}).extraPd, null);

    const owner = deriveEstimateAnalytics({
      crew,
      ...WOOD,
      jobMeta: {
        analyticsBridge: {
          ...emptyAnalyticsBridge(),
          erosionPerHour: 0,
          jvic: 0,
          extraPd: 25,
          nb: { onboarding: 0, drugDisa: 0, safety920: 0, siteClasses: 0 },
        },
      },
    });
    assert.equal(owner.bridge.drags.find((row) => row.id === "erosion")?.amount, 0);
    assert.equal(owner.bridge.drags.find((row) => row.id === "nb")?.amount, 0);
    assert.equal(owner.bridge.drags.find((row) => row.id === "jvic")?.amount, 0);
    assert.equal(owner.bridge.drags.find((row) => row.id === "pd")?.amount, 25);
  });
});

describe("Analytics tab wiring", () => {
  it("adds an Analytics tab with editable Tool / Consumables / PPE % on the estimate desk", () => {
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
    assert.doesNotMatch(desk, /ANALYTICS_LIVE_NOTE|ANALYTICS_PHASE2_NOTE|ANALYTICS_NOUN/);
    assert.doesNotMatch(desk, /Phase 2 later|Read-only|for this live estimate|Procurement\/Subcontracts/);
    assert.match(desk, /setJobMeta/);
    assert.match(desk, /analyticsStc/);
    assert.match(desk, /analyticsBridge/);
    assert.match(desk, /hydrateAnalyticsBridge/);
    assert.match(desk, /ANALYTICS_BRIDGE_SEED_NOTE/);
    assert.match(desk, /data-analytics-seed-note/);
    assert.match(desk, /data-analytics-mode-toggle/);
    assert.match(desk, /data-analytics-drag/);
    assert.match(desk, /data-analytics-bridge/);
    assert.match(desk, /Locked \$\/hr COMP adders/);
    assert.match(ANALYTICS_BRIDGE_SEED_NOTE, /dig seeds from recent actuals/);
    assert.match(desk, /DraftNumber/);
    assert.match(desk, /ANALYTICS_STC_LINES/);
    assert.match(desk, /ANALYTICS_STC_PPE_LABEL/);
    assert.match(desk, /stcDefaultHint/);
    assert.match(desk, /stcPpePct|setStcPct/);
    assert.match(desk, /stcPpePerHour/);
    assert.match(desk, /\$3\.60\/hr/);
    assert.doesNotMatch(desk, /Yates|yates/);
    assert.doesNotMatch(desk, /0\.50 \/ 1\.25 \/ 1\.85/);
    assert.doesNotMatch(desk, /9\s*→\s*5|9%→5%|Turnip import|tariff/i);
    assert.match(desk, /paper-field/);
    assert.match(desk, /onChange/);
    assert.doesNotMatch(desk, /<textarea|<select/);
    assert.doesNotMatch(rail, /deriveEstimateAnalytics|margin/i);
    assert.doesNotMatch(total, /deriveEstimateAnalytics|Analytics/);
    assert.doesNotMatch(deskTotal, /deriveEstimateAnalytics|Analytics/);
    assert.doesNotMatch(rail, /Profit Per Work Hour|Total OH Based off Base Wages/);
    assert.equal(total.includes("Margin"), false);
  });
});
