import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { archiveMenuItem, deleteMenuItem, menuForViewedDesk, menuStatus } from "./job-menu.ts";
import {
  CATALOG_SEED_CODES,
  catalogSeedsAllowedOnDesk,
  deskForUser,
  jobByCode,
  jobPlantHref,
  jobsOnDesk,
  omitCatalogSeedJobs,
  omitCatalogSeedPacks,
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

const SEED_CODES = ["HS-8622", "TA-8841", "TM-8902", "ES-8710"];

function hasCatalogSeed(jobs: Array<{ code?: string; title?: string; id?: string }>) {
  return jobs.some(
    (job) =>
      SEED_CODES.includes(job.code || "") ||
      /pre-outage hse walkdown/i.test(job.title || "") ||
      ["job-8622", "job-8841", "job-8902", "job-8710"].includes(job.id || ""),
  );
}

describe("desk counts", () => {
  it("counts real estimates, not every open job", () => {
    const catalog = seedJobs();
    assert.equal(catalog.length, 4);
    assert.equal(catalog.some((job) => job.kind === "hse"), true);
    assert.deepEqual([...CATALOG_SEED_CODES].sort(), [...SEED_CODES].sort());
    const desk = deskForUser("owner-robert-henderson");
    assert.equal(desk.jobs.length, 0);
    assert.equal(hasCatalogSeed(desk.jobs), false);
    assert.equal(desk.estimatesOpen, 3);
    assert.notEqual(desk.estimatesOpen, catalog.length);
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
    assert.equal(seedJobsAllowed(undefined), false);
    assert.equal(seedJobsAllowed(null), false);
    assert.equal(seedJobsAllowed({ isOwner: false, email: "", companyId: "madison" }), false);
    assert.equal(seedJobsAllowed(ownerScope), false);
    assert.equal(seedJobsAllowed(nathanScope), false);
    assert.equal(seedJobsAllowed(beechScope), false);
    assert.equal(seedJobsAllowed({ isOwner: false, email: "josephmhenderson2002@gmail.com", companyId: "hitsquad" }), true);
    assert.equal(catalogSeedsAllowedOnDesk(nathanScope, "nathan"), false);
    assert.equal(catalogSeedsAllowedOnDesk(ownerScope, "nathan"), false);
    assert.equal(catalogSeedsAllowedOnDesk(undefined, "nathan"), false);
    assert.equal(catalogSeedsAllowedOnDesk({ isOwner: false, email: "josephmhenderson2002@gmail.com", companyId: "hitsquad" }, "joseph"), true);

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
    assert.match(desk, /catalogSeedsAllowedOnDesk\(scope, seat\)/);
    assert.match(desk, /omitCatalogSeedJobs/);
    assert.match(desk, /omitCatalogSeedPacks/);
    assert.match(desk, /ownerKeepsHisMenuPaint\(lens, viewingAs\)/);
    assert.doesNotMatch(desk, /includeSeeds: true/);
    assert.doesNotMatch(desk, /holdPartialTree \? null/);
    assert.match(desk, /JobTreeDesk/);
    const jobsApi = readFileSync(fileURLToPath(new URL("../app/api/desk/jobs/route.ts", import.meta.url)), "utf8");
    assert.match(jobsApi, /omitCatalogSeedJobs/);
    assert.match(jobsApi, /seedJobsAllowed\(scope\)/);
    assert.match(jobsApi, /scopedDeskUser/);
    const lens = readFileSync(fileURLToPath(new URL("../components/OwnerDeskContext.tsx", import.meta.url)), "utf8");
    assert.match(lens, /Session still loading: keep stored View as Nathan/);
    assert.match(lens, /readStoredViewAs\(\)/);
    assert.match(lens, /setLensReady\(false\)/);

    assert.deepEqual(deskForUser("tester-nathan", nathanScope).jobs, []);
    assert.deepEqual(deskForUser("tester-john-beech", beechScope).jobs, []);
    assert.deepEqual(deskForUser("owner-robert-henderson", ownerScope).jobs, []);
  });

  it("view-as Nathan never paints leaked catalog seeds; estimate delete and archive still work", () => {
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
    const leaked = seedJobs();
    assert.equal(leaked.some((job) => job.code === "HS-8622"), true);
    assert.equal(deskForUser("tester-nathan", nathan).jobs.some((job) => job.code === "HS-8622"), false);
    deleteMenuItem({ id: "job-8622", title: "Pre-outage HSE walkdown — flare / piperack" }, store, "nathan");
    const afterPoll = jobsOnDesk(leaked, [cat2], true, nathan, menuForViewedDesk(true, store, "nathan"));
    assert.equal(
      afterPoll.some((job) => ["HS-8622", "TA-8841", "TM-8902", "ES-8710"].includes(job.code)),
      false,
    );
    assert.equal(afterPoll.some((job) => job.title.includes("CAT 2")), true);

    archiveMenuItem({ id: `job-${cat2.packId}`, packId: cat2.packId, title: cat2.title }, store, "nathan");
    assert.equal(
      menuStatus({ id: `job-${cat2.packId}`, packId: cat2.packId }, menuForViewedDesk(true, store, "nathan")),
      "archived",
    );

    deleteMenuItem({ id: "job-8902", title: "Coker drum valve package — time & material" }, store);
    const ownerJobs = jobsOnDesk(seedJobs(), [], false, undefined, menuForViewedDesk(false, store));
    assert.equal(hasCatalogSeed(ownerJobs), false);

    const joseph = { isOwner: false, email: "josephmhenderson2002@gmail.com", companyId: "hitsquad" as const };
    deleteMenuItem({ id: "job-8710", title: "Cooling-tower basin repair estimate" }, store);
    const josephJobs = jobsOnDesk(seedJobs(), [], false, joseph, menuForViewedDesk(false, store), {
      includeSeeds: true,
    });
    assert.equal(josephJobs.some((job) => job.id === "job-8710"), false);
    assert.equal(josephJobs.some((job) => job.code === "ES-8710"), false);

    const tm = {
      packId: "EST-MTJ5D6",
      key: "new:EST-MTJ5D6",
      title: "Wood River / T&M 2027-01 to 06",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: "nathanboyte@gmail.com",
    };
    deleteMenuItem({ id: "job-EST-MTJ5D6", packId: tm.packId, title: tm.title }, store, "nathan");
    const afterHisDelete = jobsOnDesk(leaked, [cat2, tm], true, nathan, menuForViewedDesk(true, store, "nathan"), {
      seat: "nathan",
    });
    assert.equal(afterHisDelete.some((job) => job.code === "EST-MTJ5D6" || job.title === tm.title), false);
    assert.equal(afterHisDelete.some((job) => job.title.includes("CAT 2")), true);
    assert.equal(hasCatalogSeed(afterHisDelete), false);
  });

  it("undefined scope and first-paint race never paint catalog seeds", () => {
    const aromatics = {
      packId: "new-aromatics-2027",
      key: "new:new-aromatics-2027",
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: "nathanboyte@gmail.com",
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
      ownerEmail: "nathanboyte@gmail.com",
    };
    const tm = {
      packId: "EST-MTJ5D6",
      key: "new:EST-MTJ5D6",
      title: "Wood River / T&M 2027-01 to 06",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: "nathanboyte@gmail.com",
    };
    const nathan = { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" as const };
    const his = [aromatics, cat2, tm];

    const race = jobsOnDesk(undefined, [], false, undefined);
    assert.equal(race.length, 0);
    assert.equal(hasCatalogSeed(race), false);

    const leakedRace = jobsOnDesk(seedJobs(), [], false, undefined, undefined, { includeSeeds: true });
    assert.equal(hasCatalogSeed(leakedRace), false);
    assert.equal(leakedRace.length, 0);

    const firstPaint = jobsOnDesk(undefined, his, false, undefined);
    assert.equal(hasCatalogSeed(firstPaint), false);
    assert.equal(firstPaint.some((job) => job.title === "2027 Aromatics Turnaround"), true);
    assert.equal(firstPaint.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
    assert.equal(firstPaint.some((job) => job.code === "EST-MTJ5D6"), true);

    const nathanLogin = jobsOnDesk(seedJobs(), his, false, nathan);
    assert.equal(hasCatalogSeed(nathanLogin), false);
    assert.equal(nathanLogin.some((job) => job.title.includes("Aromatics")), true);
    assert.equal(nathanLogin.some((job) => job.title.includes("CAT 2")), true);
    assert.equal(nathanLogin.some((job) => job.code === "EST-MTJ5D6"), true);

    const viewAsNathan = jobsOnDesk(seedJobs(), his, true, nathan, undefined, { includeSeeds: true, seat: "nathan" });
    assert.equal(hasCatalogSeed(viewAsNathan), false);
    assert.equal(omitCatalogSeedJobs(seedJobs()).length, 0);
    assert.deepEqual(deskForUser("tester-nathan", nathan).jobs, []);
    assert.deepEqual(deskForUser("tester-nathan").jobs, []);
  });

  it("owner leftover catalog samples do not paint on View as Nathan or Back to me", () => {
    const leftoverSeeds = seedJobs().map((job) => ({
      packId: job.id,
      key: `new:${job.id}`,
      title: job.title,
      client: job.client,
      site: "Madison / P66",
      siteId: "site-unassigned",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: OWNER_LOGIN_EMAIL,
    }));
    const his = {
      packId: "new-mtaajdwa-f7539",
      key: "new:new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: "nathanboyte@gmail.com",
    };
    const nathan = { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" as const };
    const ownerScope = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
    const leftover = [...leftoverSeeds, his];
    assert.equal(omitCatalogSeedPacks(leftover).some((pack) => pack.title.includes("CAT 2")), true);
    assert.equal(omitCatalogSeedPacks(leftover).some((pack) => /pre-outage hse walkdown/i.test(pack.title)), false);

    const viewAs = jobsOnDesk(seedJobs(), leftover, true, ownerScope, undefined, { includeSeeds: true, seat: "nathan" });
    assert.equal(hasCatalogSeed(viewAs), false);
    assert.equal(viewAs.some((job) => job.title.includes("CAT 2")), true);

    const nathanLens = jobsOnDesk(seedJobs(), leftover, true, nathan, undefined, { seat: "nathan" });
    assert.equal(hasCatalogSeed(nathanLens), false);
    assert.equal(nathanLens.some((job) => job.title.includes("CAT 2")), true);

    const backToMe = jobsOnDesk(seedJobs(), leftover, false, ownerScope);
    assert.equal(hasCatalogSeed(backToMe), false);
    assert.equal(backToMe.some((job) => job.title.includes("CAT 2")), true);
  });
});
