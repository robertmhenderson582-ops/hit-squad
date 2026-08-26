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

  it("Days & nights crew totals use nights hours, not a shared Hours / shift", () => {
    const row = blankCraftRow();
    row.position = "Cost Analyst";
    row.shift = "Days & nights";
    row.ranges = [
      {
        ...blankRange(),
        start: "2027-01-03",
        end: "2027-01-08",
        hoursPerShift: 9,
        nightHoursPerShift: 8,
        headcount: 1,
        nightHeadcount: 1,
        perDiemPeople: 1,
        nightPerDiemPeople: 1,
        days: [true, true, true, true, true, true, false],
        shift: "Days & nights",
      },
    ];
    const split = hoursFromCrewRows([row], "Wood River", "Phillips 66");
    const bothNine = hoursFromCrewRows(
      [{ ...row, ranges: [{ ...row.ranges[0], nightHoursPerShift: undefined }] }],
      "Wood River",
      "Phillips 66",
    );
    assert.equal(split, 102);
    assert.equal(bothNine, 108);
    assert.notEqual(split, bothNine);
  });
});
