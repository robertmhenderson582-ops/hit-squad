import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { archiveMenuItem, deleteMenuItem, menuForViewedDesk, menuStatus } from "./job-menu.ts";
import {
  deskForUser,
  jobByCode,
  jobPlantHref,
  jobsOnDesk,
  packForJob,
  plantJobTally,
  plantJobsLine,
  plantTabFromQuery,
  seedJobs,
  seedJobsAllowed,
} from "./jobs.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOHN_BEECH_EMAIL } from "./tester-seats.ts";
import type { StorageLike } from "./local-estimates.ts";

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

  it("owner first paint includes local and snapshot packs without waiting a vault tick", () => {
    const aromatics = {
      packId: "new-aromatics-2027",
      key: "new:new-aromatics-2027",
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: "robertmhenderson582@gmail.com",
    };
    const cat = {
      packId: "new-mtaajdwa-f7539",
      key: "new:new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
    };
    const ownerScope = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
    const firstPaint = jobsOnDesk(undefined, [aromatics, cat], false, ownerScope);
    assert.equal(firstPaint.some((job) => job.title === "2027 Aromatics Turnaround"), true);
    assert.equal(firstPaint.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
    assert.equal(firstPaint.some((job) => job.id === "job-8841"), false);
    const held = jobsOnDesk(undefined, [aromatics, cat], false, ownerScope, undefined, { includeSeeds: false });
    assert.equal(held.some((job) => job.id === "job-8841"), false);
    assert.equal(held.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  });

  it("does not paint sample seed jobs on owner, Nathan, or John Beech desks", () => {
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
    const ownerScope = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
    const nathanScope = { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" as const };
    const beechScope = { isOwner: false, email: JOHN_BEECH_EMAIL, companyId: "madison" as const };
    assert.equal(seedJobsAllowed(ownerScope), false);
    assert.equal(seedJobsAllowed(nathanScope), false);
    assert.equal(seedJobsAllowed(beechScope), false);
    assert.equal(seedJobsAllowed({ isOwner: false, email: "josephmhenderson2002@gmail.com", companyId: "hitsquad" }), true);

    const ownerJobs = jobsOnDesk([], [cat2], false, ownerScope);
    assert.equal(ownerJobs.some((job) => job.id === "job-8841"), false);
    assert.equal(ownerJobs.some((job) => job.id === "job-new-mtaajdwa-f7539"), true);
    assert.equal(ownerJobs.length, 1);

    const followed = jobsOnDesk([], [cat2], true);
    assert.equal(followed.some((job) => job.id === "job-8841"), false);
    assert.equal(followed.length, 1);
    assert.equal(followed[0]?.title, "Madison CAT 2 (Pit Stop)");

    const emptyFollow = jobsOnDesk([], [], true);
    assert.equal(emptyFollow.length, 0);
    const emptyOwner = jobsOnDesk([], [], false, ownerScope);
    assert.equal(emptyOwner.length, 0);

    const firstPaintOwner = jobsOnDesk(undefined, [cat2], false, ownerScope);
    assert.equal(firstPaintOwner.length, 1);
    assert.equal(firstPaintOwner[0]?.title, "Madison CAT 2 (Pit Stop)");
    const afterStopFollowing = jobsOnDesk([], [cat2], false, ownerScope);
    assert.equal(afterStopFollowing.some((job) => job.code === "TA-8841"), false);
    const cat2Job = ownerJobs.find((job) => job.id === "job-new-mtaajdwa-f7539");
    assert.ok(cat2Job);
    assert.equal(packForJob(cat2Job, [cat2])?.packId, "new-mtaajdwa-f7539");
    assert.equal(packForJob({ id: "job-8841" }, [cat2]), undefined);

    const desk = readFileSync(fileURLToPath(new URL("../components/JobsDesk.tsx", import.meta.url)), "utf8");
    assert.match(desk, /seedJobsAllowed\(scope\)/);
    assert.doesNotMatch(desk, /includeSeeds: true/);
    assert.doesNotMatch(desk, /holdPartialTree \? null/);
    assert.match(desk, /JobTreeDesk/);
  });

  it("view-as Nathan delete of HS-8622 stays gone after a seed reload; estimate delete and archive still work", () => {
    const data: Record<string, string> = {};
    const store: StorageLike = {
      getItem(key) {
        return data[key] ?? null;
      },
      setItem(key, value) {
        data[key] = value;
      },
      removeItem(key) {
        delete data[key];
      },
    };
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
    const nathan = { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" as const };
    const seeds = deskForUser("tester-nathan", nathan).jobs;
    assert.equal(seeds.some((job) => job.code === "HS-8622"), true);
    deleteMenuItem({ id: "job-8622", title: "Pre-outage HSE walkdown — flare / piperack" }, store, "nathan");
    const afterPoll = jobsOnDesk(seeds, [cat2], true, nathan, menuForViewedDesk(true, store, "nathan"));
    assert.equal(afterPoll.some((job) => job.code === "HS-8622" || job.id === "job-8622"), false);
    assert.equal(afterPoll.some((job) => job.title.includes("CAT 2")), true);

    archiveMenuItem({ id: `job-${cat2.packId}`, packId: cat2.packId, title: cat2.title }, store, "nathan");
    assert.equal(
      menuStatus({ id: `job-${cat2.packId}`, packId: cat2.packId }, menuForViewedDesk(true, store, "nathan")),
      "archived",
    );

    deleteMenuItem({ id: "job-8902", title: "Coker drum valve package — time & material" }, store);
    const ownerJobs = jobsOnDesk(seedJobs(), [], false, undefined, menuForViewedDesk(false, store));
    assert.equal(ownerJobs.some((job) => job.id === "job-8902"), false);
    assert.equal(ownerJobs.some((job) => job.code === "TA-8841"), true);
  });
});
