import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deskForUser,
  jobByCode,
  jobPlantHref,
  jobsOnDesk,
  plantJobTally,
  plantJobsLine,
  plantTabFromQuery,
  seedJobs,
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

  it("keeps owner seed jobs after header nav and hides them while following", () => {
    const cat2 = {
      packId: "new-mtaajdwa-f7539",
      key: "new:new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
    };
    const ownerJobs = jobsOnDesk([], [cat2], false);
    assert.equal(ownerJobs.some((job) => job.id === "job-8841"), true);
    assert.equal(ownerJobs.some((job) => job.id === "job-new-mtaajdwa-f7539"), true);
    assert.equal(ownerJobs.length, seedJobs().length + 1);

    const followed = jobsOnDesk([], [cat2], true);
    assert.equal(followed.some((job) => job.id === "job-8841"), false);
    assert.equal(followed.length, 1);
    assert.equal(followed[0]?.title, "Madison CAT 2 (Pit Stop)");

    const emptyFollow = jobsOnDesk([], [], true);
    assert.equal(emptyFollow.length, 0);
    const emptyOwner = jobsOnDesk([], [], false);
    assert.equal(emptyOwner.length, seedJobs().length);

    const firstPaintOwner = jobsOnDesk(undefined, [cat2], false);
    assert.equal(firstPaintOwner.length, seedJobs().length + 1);
    assert.equal(
      plantJobTally(firstPaintOwner.filter((job) => job.id !== "job-new-mtaajdwa-f7539")).total,
      seedJobs().length,
    );
    const afterStopFollowing = jobsOnDesk([], [cat2], false);
    assert.equal(afterStopFollowing.some((job) => job.code === "TA-8841"), true);
  });
});
