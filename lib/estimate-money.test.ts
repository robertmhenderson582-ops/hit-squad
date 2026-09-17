import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANALYTICS_BRIDGE_SEED_NOTE,
  WR_EAST_BRIDGE_SEED,
  cbaIncreaseDollars,
  emptyAnalyticsStc,
  emptyJobMoney,
  hydrateAnalyticsBridge,
  hydrateAnalyticsStc,
  hydrateJobMoney,
  stcPpeSavingsPctPoints,
  stcPpeSavingsRate,
  isCbaCraftLane,
  laborContingencyDollars,
  moneyAdderLines,
  moreFundDollars,
  moreFundIsEmpty,
  subsContingencyDollars,
} from "./estimate-money.ts";
import { laborDollarsFromCrew } from "./shahan-wood-river.ts";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { computeRangeHours } from "./hours-clock.ts";
import { lookupCompWageRow } from "./wage-lookup.ts";
import { emptyJobMeta } from "./staffing-plan.ts";
import { setOrgChartName, emptyOrgChart } from "./org-chart.ts";

const WEEK = {
  start: "2026-09-14",
  end: "2026-09-18",
  hoursPerShift: 10,
  headcount: 1,
  nightHeadcount: 0,
  perDiemPeople: 1,
  days: [false, true, true, true, true, true, false],
};

describe("M.O.R.E. fund", () => {
  it("never seeds a default rate", () => {
    assert.equal(emptyJobMoney().moreFundPerHour, null);
    assert.equal(hydrateJobMoney({}).moreFundPerHour, null);
    assert.equal(hydrateJobMoney({ moreFundPerHour: "" }).moreFundPerHour, null);
    assert.equal(emptyJobMeta().moreFundPerHour, null);
    assert.notEqual(emptyJobMoney().moreFundPerHour, -8);
    assert.equal(moreFundIsEmpty(null), true);
    assert.equal(moreFundIsEmpty(0), true);
    assert.equal(moreFundDollars({ direct: [] }, null), 0);
    assert.deepEqual(emptyJobMoney().holidays, []);
    assert.deepEqual(hydrateJobMoney({ holidays: ["2026-09-16", "nope", "2026-09-16"] }).holidays, [
      "2026-09-16",
    ]);
    assert.deepEqual(emptyJobMeta().holidays, []);
    assert.deepEqual(emptyJobMoney().analyticsStc, { stcPpeSavingsPct: null });
    assert.deepEqual(hydrateJobMoney({}).analyticsStc, { stcPpeSavingsPct: null });
    assert.deepEqual(emptyJobMeta().analyticsStc, { stcPpeSavingsPct: null });
    assert.equal(emptyJobMoney().analyticsBridge.mode, "pct");
    assert.equal(emptyJobMoney().analyticsBridge.locked.stcPpePerHour, 3.6);
    assert.equal(emptyJobMoney().analyticsBridge.locked.ohPerHour, null);
    assert.equal(hydrateJobMoney({}).analyticsBridge.locked.profitPerHour, null);
    assert.equal(emptyJobMoney().analyticsBridge.erosionPerHour, WR_EAST_BRIDGE_SEED.erosionPerHour);
    assert.equal(emptyJobMoney().analyticsBridge.jvic, WR_EAST_BRIDGE_SEED.jvic);
    assert.equal(emptyJobMoney().analyticsBridge.extraPd, null);
    assert.deepEqual(emptyJobMoney().analyticsBridge.nb, { ...WR_EAST_BRIDGE_SEED.nb });
  });
});

describe("Wood River Analytics bridge seeds", () => {
  it("hydrates empty / null drag fields to WR dig seeds and keeps Owner overrides", () => {
    const seeded = hydrateAnalyticsBridge({});
    assert.equal(seeded.erosionPerHour, 0.05);
    assert.equal(seeded.nb.onboarding, 126383.43);
    assert.equal(seeded.nb.drugDisa, 66478.51);
    assert.equal(seeded.nb.safety920, 48176.58);
    assert.equal(seeded.nb.siteClasses, 16718);
    assert.equal(seeded.extraPd, null);
    assert.equal(seeded.jvic, 944335.07);
    assert.equal(seeded.locked.stcPpePerHour, 3.6);
    assert.equal(seeded.locked.ohPerHour, null);
    assert.equal(seeded.locked.profitPerHour, null);
    assert.equal(seeded.erosionPctOfBw, null);
    assert.match(ANALYTICS_BRIDGE_SEED_NOTE, /Wood River dig seeds/);
    assert.equal(ANALYTICS_BRIDGE_SEED_NOTE.includes("9→5"), false);

    const fromNulls = hydrateAnalyticsBridge({
      erosionPerHour: null,
      jvic: "",
      extraPd: null,
      nb: { onboarding: null, drugDisa: "", safety920: null, siteClasses: null },
      locked: { ohPerHour: null, profitPerHour: "" },
    });
    assert.deepEqual(fromNulls.nb, { ...WR_EAST_BRIDGE_SEED.nb });
    assert.equal(fromNulls.erosionPerHour, WR_EAST_BRIDGE_SEED.erosionPerHour);
    assert.equal(fromNulls.jvic, WR_EAST_BRIDGE_SEED.jvic);
    assert.equal(fromNulls.extraPd, null);
    assert.equal(fromNulls.locked.ohPerHour, null);
    assert.equal(fromNulls.locked.profitPerHour, null);

    const owner = hydrateAnalyticsBridge({
      erosionPerHour: 0,
      jvic: 0,
      extraPd: 100,
      nb: { onboarding: 0, drugDisa: 12, safety920: 0, siteClasses: 99 },
    });
    assert.equal(owner.erosionPerHour, 0);
    assert.equal(owner.jvic, 0);
    assert.equal(owner.extraPd, 100);
    assert.equal(owner.nb.onboarding, 0);
    assert.equal(owner.nb.drugDisa, 12);
    assert.equal(owner.nb.safety920, 0);
    assert.equal(owner.nb.siteClasses, 99);
  });

  it("leaves old STC burden % blank and keeps Owner savings", () => {
    assert.deepEqual(hydrateAnalyticsStc({ toolPct: 5, consumablesPct: 0, ppePct: 2.75 }), { stcPpeSavingsPct: null });
    assert.deepEqual(hydrateAnalyticsStc({ stcPpePct: 8, toolPct: 1 }), { stcPpeSavingsPct: null });
    assert.deepEqual(hydrateAnalyticsStc({ stcPpeSavingsPct: 10 }), { stcPpeSavingsPct: 10 });
    assert.deepEqual(hydrateAnalyticsStc({ stcPpeSavingsPct: 0 }), { stcPpeSavingsPct: 0 });
    assert.deepEqual(hydrateAnalyticsStc({}), { stcPpeSavingsPct: null });
    assert.equal(stcPpeSavingsPctPoints(emptyAnalyticsStc()), 0);
    assert.equal(stcPpeSavingsRate(emptyAnalyticsStc()), 0);
    assert.equal(stcPpeSavingsRate({ stcPpeSavingsPct: 35 }), 0.35);
    assert.equal(stcPpeSavingsRate({ stcPpeSavingsPct: 0 }), 0);
    assert.equal(hydrateAnalyticsBridge({ locked: { toolPerHour: 0.5, consumablesPerHour: 1.25, ppePerHour: 1.85 } }).locked.stcPpePerHour, 3.6);
    assert.equal(hydrateAnalyticsBridge({ locked: { toolPerHour: 1, consumablesPerHour: 1, ppePerHour: 2 } }).locked.stcPpePerHour, 4);
    assert.equal(hydrateAnalyticsBridge({ locked: { stcPpePerHour: 0 } }).locked.stcPpePerHour, 0);
    assert.equal(hydrateAnalyticsBridge({ locked: { stcPpePerHour: 5, toolPerHour: 1 } }).locked.stcPpePerHour, 5);
    assert.equal(hydrateJobMoney({}).analyticsBridge.locked.stcPpePerHour, 3.6);
  });
});

describe("job holidays", () => {
  it("drops desk labor dollars the same as range skipDates", () => {
    const site = "Wood River — Roxana, IL";
    const client = "Phillips 66";
    const crew = { direct: [{ position: "Boilermaker Journeyman", ranges: [WEEK] }] };
    const full = laborDollarsFromCrew(crew, site, client);
    const holiday = laborDollarsFromCrew(crew, site, client, {}, ["2026-09-16"]);
    const skipped = laborDollarsFromCrew(
      { direct: [{ position: "Boilermaker Journeyman", ranges: [{ ...WEEK, skipDates: ["2026-09-16"] }] }] },
      site,
      client,
    );
    assert.equal(full > holiday, true);
    assert.equal(holiday, skipped);
    const open = deskPackageTotal({ crew, site, client, jobMeta: {} });
    const closed = deskPackageTotal({ crew, site, client, jobMeta: { holidays: ["2026-09-16"] } });
    assert.equal(closed < open, true);
  });
});

describe("labor contingency", () => {
  it("is Crew ST/OT/DT only — not PD", () => {
    const labor = 1000;
    const pd = 500;
    assert.equal(laborContingencyDollars(labor, 10), 100);
    assert.notEqual(laborContingencyDollars(labor + pd, 10), 100);
    assert.equal(laborContingencyDollars(labor, 0), 0);
  });

  it("does not fold CBA into the labor contingency base", () => {
    const lines = moneyAdderLines({
      labor: 1000,
      money: { laborContingencyPct: 10, cbaIncreaseOn: true },
      cbaIncrease: 200,
    });
    assert.equal(lines.laborContingency, 100);
    assert.equal(lines.cbaIncrease, 200);
  });
});

describe("CBA increase", () => {
  it("does not hit Merit staff", () => {
    const money = { cbaIncreaseOn: true, cbaIncreasePct: 10, cbaIncreaseDate: "2026-01-01" };
    const staff = {
      staff: [
        {
          position: "Superintendent 01",
          laborClassOverride: "Merit" as const,
          ranges: [WEEK],
        },
      ],
    };
    assert.equal(isCbaCraftLane("staff", staff.staff[0]!), false);
    assert.equal(cbaIncreaseDollars(staff, money, "Wood River — Roxana, IL", "Phillips 66"), 0);
    const craft = {
      direct: [
        {
          position: "Boilermaker Journeyman",
          ranges: [WEEK],
        },
      ],
    };
    assert.equal(isCbaCraftLane("direct", craft.direct[0]!), true);
    assert.equal(cbaIncreaseDollars(craft, money, "Wood River — Roxana, IL", "Phillips 66") > 0, true);
  });

  it("lifts CBA hours on base wage, not billed ST", () => {
    const site = "Wood River — Roxana, IL";
    const client = "Phillips 66";
    const money = { cbaIncreaseOn: true, cbaIncreasePct: 10, cbaIncreaseDate: "2026-01-01" };
    const row = { position: "Boilermaker Journeyman", ranges: [WEEK] };
    const split = computeRangeHours({
      position: row.position,
      site,
      client,
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
    const wage = lookupCompWageRow(row.position, site);
    assert.ok(wage && wage.baseSt && wage.st);
    assert.equal(wage.baseSt < wage.st, true);
    const lift = cbaIncreaseDollars({ direct: [row] }, money, site, client);
    const expected = Math.round(hours * wage.baseSt * 0.1 * 100) / 100;
    const billed = Math.round(hours * wage.st * 0.1 * 100) / 100;
    assert.equal(hours > 0, true);
    assert.equal(lift, expected);
    assert.equal(lift < billed, true);
    assert.equal(
      cbaIncreaseDollars(
        { direct: [{ position: "Boilermaker ASST Foreman", ranges: [WEEK] }] },
        money,
        site,
        client,
      ),
      0,
    );
  });
});

describe("subs contingency vs markup", () => {
  it("applies the subs adder to affiliate while 6.5% markup stays off", () => {
    assert.equal(subsContingencyDollars(4000, 5), 200);
  });
});

describe("Staff names do not change crew dollars", () => {
  it("org-chart names leave Shahan billed ST/OT/DT alone", () => {
    const crew = {
      staff: [
        {
          id: "st-1",
          position: "Superintendent 01",
          ranges: [WEEK],
        },
      ],
    };
    const snapshot = JSON.stringify(crew);
    const before = laborDollarsFromCrew(crew, "Wood River — Roxana, IL", "Phillips 66");
    setOrgChartName(emptyOrgChart(), "st-1", "days", "Pat Day");
    const after = laborDollarsFromCrew(crew, "Wood River — Roxana, IL", "Phillips 66");
    assert.equal(after, before);
    assert.equal(JSON.stringify(crew), snapshot);
    assert.equal(before > 0, true);
  });
});
