import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyScheduleKpi,
  hydrateScheduleKpi,
  parsePhysicalPct,
  resolveScheduleEarned,
  scheduleAreaHours,
  scheduleKpiEntered,
} from "./cost-report-schedule.ts";

describe("schedule / progress KPI", () => {
  it("parses physical % as 45, 45%, or 0.45", () => {
    assert.equal(parsePhysicalPct("45"), 0.45);
    assert.equal(parsePhysicalPct("45%"), 0.45);
    assert.equal(parsePhysicalPct(0.45), 0.45);
    assert.equal(parsePhysicalPct(""), null);
    assert.equal(parsePhysicalPct(-1), null);
  });

  it("hours win over typed Earned % when both are present", () => {
    const kpi = hydrateScheduleKpi({
      earnedHours: 126,
      earnedPct: 0.9,
      plannedHours: 168,
      targetHours: 280,
    });
    const resolved = resolveScheduleEarned(kpi, 280, 60);
    assert.equal(resolved.fromKpi, true);
    assert.equal(resolved.hoursAreSource, true);
    assert.equal(resolved.toDate, 126);
    assert.equal(resolved.daily, 66);
    assert.equal(resolved.pct, 0.45);
  });

  it("accepts Day-1 aliases earnedHoursToDate / physicalPctToDate", () => {
    const kpi = hydrateScheduleKpi({
      earnedHoursToDate: 126,
      physicalPctToDate: 0.9,
      earnedHoursDaily: 42,
      units: [{ unit: "Boiler A", earnedHours: 80 }],
    });
    assert.equal(kpi.earnedHours, 126);
    assert.equal(kpi.earnedPct, 0.9);
    assert.equal(kpi.incEarned, 42);
    assert.equal(kpi.areas[0]?.area, "Boiler A");
    assert.equal(resolveScheduleEarned(kpi, 280).toDate, 126);
  });

  it("rolls Area hours when the job total is blank", () => {
    const kpi = hydrateScheduleKpi({
      areas: [
        { area: "Boiler A", earnedHours: 80 },
        { area: "Boiler B", earnedHours: 46 },
      ],
    });
    assert.equal(scheduleKpiEntered(kpi), true);
    assert.equal(scheduleAreaHours(kpi), 126);
    assert.equal(resolveScheduleEarned(kpi, 280).toDate, 126);
  });

  it("derives earned from Earned % when no hours are typed", () => {
    const kpi = hydrateScheduleKpi({ earnedPct: 45 });
    const resolved = resolveScheduleEarned(kpi, 200);
    assert.equal(resolved.toDate, 90);
    assert.equal(resolved.hoursAreSource, false);
    assert.equal(resolved.pct, 0.45);
  });

  it("empty KPI is not entered — Day-0 stand-in path", () => {
    assert.equal(scheduleKpiEntered(emptyScheduleKpi()), false);
    assert.equal(resolveScheduleEarned(emptyScheduleKpi(), 200).fromKpi, false);
  });
});
