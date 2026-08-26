import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deskForUser,
  jobByCode,
  jobPlantHref,
  plantJobTally,
  plantJobsLine,
  plantTabFromQuery,
} from "./jobs.ts";

describe("desk counts", () => {
  it("counts real estimates, not every open job", () => {
    const desk = deskForUser("owner-robert-henderson");
    assert.equal(desk.jobs.length, 4);
    assert.equal(desk.jobs.some((job) => job.kind === "hse"), true);
    assert.equal(desk.estimatesOpen, 3);
    assert.notEqual(desk.estimatesOpen, desk.jobs.length);
  });

  it("keeps Wood River job IDs openable without inventing a fifth job", () => {
    const tally = plantJobTally();
    assert.deepEqual(tally, { total: 4, open: 3, hold: 1, estimates: 3, hse: 1 });
    assert.match(plantJobsLine(tally), /4 jobs on this plant \(3 open, 1 hold\)/);
    assert.match(plantJobsLine(tally), /3 estimates/);
    const job = jobByCode("TA-8841");
    assert.equal(job?.workingFigure, "$2.41M working");
    assert.equal(job?.window, "12 Sep → 04 Oct 2026");
    assert.equal(jobPlantHref("TA-8841"), "/jobs/wood-river?job=TA-8841");
    assert.equal(jobPlantHref("TA-8841", "Estimates"), "/jobs/wood-river?job=TA-8841&tab=estimates");
    assert.equal(plantTabFromQuery("change-orders"), "Change orders");
    assert.equal(jobByCode("NO-SUCH"), undefined);
  });
});
