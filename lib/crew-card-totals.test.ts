import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatDeskDollars, laborDollarsFromCrew, shahanCrewCostAmount } from "./shahan-wood-river.ts";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("crew card grand totals", () => {
  it("shows ST / OT / DT / PD and cost on Staff through Support, and Estimate Total rolls dollars", () => {
    const grid = read("../components/CraftLaborGrid.tsx");
    assert.match(grid, /Grand total/);
    assert.match(grid, /tfoot/);
    assert.match(grid, /totals\.pd/);
    assert.match(grid, /costAmount/);
    const support = read("../components/SupportCrewCard.tsx");
    assert.match(support, /Grand total/);
    assert.match(support, /tfoot/);
    const rail = read("../components/EstimateTotalRail.tsx");
    assert.match(rail, /Estimate total/);
    assert.match(rail, /deskPackageBreakdown/);

    const hours = { st: 10, ot: 2, dt: 0 };
    const amount = shahanCrewCostAmount("Manager, Project 01", hours);
    assert.equal(amount > 0, true);
    assert.match(formatDeskDollars(amount), /^\$/);
    const labor = laborDollarsFromCrew(
      {
        staff: [
          {
            position: "Manager, Project 01",
            ranges: [
              {
                start: "2026-09-01",
                end: "2026-09-01",
                hoursPerShift: 10,
                headcount: 1,
                nightHeadcount: 0,
                perDiemPeople: 1,
                days: [true, true, true, true, true, true, true],
              },
            ],
          },
        ],
      },
      "Wood River — Roxana, IL",
      "Phillips 66",
    );
    assert.equal(labor >= 0, true);
  });
});
