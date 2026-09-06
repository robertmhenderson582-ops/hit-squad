import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyScheduleKpi,
  hydrateScheduleKpi,
  parsePhysicalPct,
  resolveScheduleEarned,
  scheduleKpiEntered,
  scheduleUnitHours,
} from "./cost-report-schedule.ts";

describe("schedule / progress KPI", () => {
  it("parses physical % as 45, 45%, or 0.45", () => {
    assert.equal(parsePhysicalPct("45"), 0.45);
    assert.equal(parsePhysicalPct("45%"), 0.45);
    assert.equal(parsePhysicalPct(0.45), 0.45);
    assert.equal(parsePhysicalPct(""), null);
    assert.equal(parsePhysicalPct(-1), null);
  });

  it("hours win over typed % when both are present", () => {
    const kpi = hydrateScheduleKpi({
      earnedHoursToDate: 126,
      physicalPctToDate: 0.9,
    });
    const resolved = resolveScheduleEarned(kpi, 280, 60);
    assert.equal(resolved.fromKpi, true);
    assert.equal(resolved.hoursAreSource, true);
    assert.equal(resolved.toDate, 126);
    assert.equal(resolved.daily, 66);
    assert.equal(resolved.pct, 0.45);
  });

  it("rolls unit hours when the job total is blank", () => {
    const kpi = hydrateScheduleKpi({
      units: [
        { unit: "Boiler A", earnedHours: 80 },
        { unit: "Boiler B", earnedHours: 46 },
      ],
    });
    assert.equal(scheduleKpiEntered(kpi), true);
    assert.equal(scheduleUnitHours(kpi), 126);
    assert.equal(resolveScheduleEarned(kpi, 280).toDate, 126);
  });

  it("derives earned from physical % when no hours are typed", () => {
    const kpi = hydrateScheduleKpi({ physicalPctToDate: 45 });
    const resolved = resolveScheduleEarned(kpi, 200);
    assert.equal(resolved.toDate, 90);
    assert.equal(resolved.hoursAreSource, false);
    assert.equal(resolved.pct, 0.45);
  });

  it("empty KPI is not entered", () => {
    assert.equal(scheduleKpiEntered(emptyScheduleKpi()), false);
    assert.equal(resolveScheduleEarned(emptyScheduleKpi(), 200).fromKpi, false);
  });
});
