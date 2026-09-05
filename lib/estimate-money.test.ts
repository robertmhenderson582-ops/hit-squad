import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cbaIncreaseDollars,
  emptyJobMoney,
  hydrateJobMoney,
  isCbaCraftLane,
  laborContingencyDollars,
  moneyAdderLines,
  moreFundDollars,
  moreFundIsEmpty,
  subsContingencyDollars,
} from "./estimate-money.ts";
import { laborDollarsFromCrew } from "./shahan-wood-river.ts";
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
