import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankCraftRow, blankRange } from "./craft-labor.ts";
import { craftRowsFromCrew, hoursFromCrewRows } from "./crew-hours.ts";

describe("cost EST hours from crew", () => {
  it("stays 0 until a real position is on the crew calendar", () => {
    const empty = blankCraftRow();
    assert.equal(hoursFromCrewRows([empty], "Wood River", "Phillips 66"), 0);
    assert.equal(craftRowsFromCrew({ staff: [], direct: [] }).length, 0);
  });

  it("adds hours from chosen crew rows without inventing EV dollars", () => {
    const row = blankCraftRow();
    row.position = "Boilermaker Journeyman";
    row.ranges = [
      {
        ...blankRange(),
        start: "2026-09-14",
        end: "2026-09-18",
        hoursPerShift: 10,
        headcount: 1,
        days: [false, true, true, true, true, true, false],
      },
    ];
    assert.equal(hoursFromCrewRows([row], "Wood River", "Phillips 66") > 0, true);
  });
});
