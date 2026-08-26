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
  it("does not invent dummy owner jobs or estimate counts", () => {
    const desk = deskForUser("owner-robert-henderson");
    assert.deepEqual(desk.jobs, []);
    assert.equal(desk.estimatesOpen, 0);
    assert.equal(desk.costTickets, 0);
    assert.equal(desk.hseOpen, 0);
    assert.deepEqual(deskForUser("tester-joseph-look").jobs, []);
  });

  it("keeps plant job hrefs without seeding a dummy job list", () => {
    const tally = plantJobTally();
    assert.deepEqual(tally, { total: 0, open: 0, hold: 0, estimates: 0, hse: 0 });
    assert.match(plantJobsLine(tally), /0 jobs on this plant \(0 open\)/);
    assert.match(plantJobsLine(tally), /0 estimates/);
    assert.equal(jobByCode("TA-8841"), undefined);
    assert.equal(jobByCode("TM-8902"), undefined);
    assert.equal(jobByCode("ES-8710"), undefined);
    assert.equal(jobByCode("HS-8622"), undefined);
    assert.equal(jobPlantHref("TA-8841"), "/jobs/wood-river?job=TA-8841");
    assert.equal(jobPlantHref("TA-8841", "Estimates"), "/jobs/wood-river?job=TA-8841&tab=estimates");
    assert.equal(plantTabFromQuery("change-orders"), "Change orders");
    assert.equal(jobByCode("NO-SUCH"), undefined);
  });
});
