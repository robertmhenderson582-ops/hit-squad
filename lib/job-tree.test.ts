import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANIES, LUCKY13_ID, STANDALONE_ID, companyScopeFor } from "./companies.ts";
import { dummyPacksForUser } from "./cbi-dummy.ts";
import { catalogEstimates } from "./desk-data.ts";
import { jobsOnDesk, seedJobs } from "./jobs.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  companyIdForJob,
  defaultOpenCompanyId,
  jobEstimateHref,
  jobTree,
  matchCatalogSite,
  sitesForCompany,
  UNASSIGNED_SITE_ID,
} from "./job-tree.ts";
import { JAMES_EMAIL, JOHN_BEECH_EMAIL, JOHN_HENRY_EMAIL, JOSEPH_EMAIL } from "./tester-seats.ts";

const owner = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
const nathan = { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" as const };
const johnBeech = { isOwner: false, email: JOHN_BEECH_EMAIL, companyId: "madison" as const };
const james = { isOwner: false, email: JAMES_EMAIL, companyId: "cbi" as const };
const joseph = { isOwner: false, email: JOSEPH_EMAIL, companyId: "hitsquad" as const };
const johnHenry = { isOwner: false, email: JOHN_HENRY_EMAIL, companyId: LUCKY13_ID };

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
  sharedWith: [OWNER_LOGIN_EMAIL],
};

describe("job tree", () => {
  it("opens Madison by default and keeps P66 / Yates as Madison sites", () => {
    assert.equal(defaultOpenCompanyId(COMPANIES), "madison");
    assert.equal(defaultOpenCompanyId([{ id: "cbi" }]), "cbi");
    assert.equal(sitesForCompany("madison").some((site) => site.id === "site-madison"), true);
    assert.equal(sitesForCompany("madison").some((site) => site.id === "site-yates"), true);
    assert.equal(sitesForCompany("cbi").length, 0);
    assert.equal(matchCatalogSite("Madison CAT 2 Wood River — Roxana, IL")?.id, "site-madison");
  });

  it("lets the owner see every company and testers only the one they are on", () => {
    const ownerTree = jobTree({ scope: owner, jobs: jobsOnDesk([], [cat2], false, owner), packs: [cat2] });
    assert.deepEqual(
      ownerTree.map((row) => row.id),
      ["hitsquad", "madison", "cbi", LUCKY13_ID],
    );
    const madison = ownerTree.find((row) => row.id === "madison");
    const wood = madison?.sites.find((site) => site.id === "site-madison");
    assert.equal(wood?.assigned, true);
    assert.equal(wood?.jobs.some((job) => job.id === "job-new-mtaajdwa-f7539"), true);
    assert.equal(madison?.sites.some((site) => site.id === "site-yates" && !site.assigned && !site.jobs.length), true);
    assert.equal(ownerTree.find((row) => row.id === LUCKY13_ID)?.sites.some((site) => site.id === UNASSIGNED_SITE_ID), true);

    const nathanTree = jobTree({ scope: nathan, jobs: jobsOnDesk([], [cat2], false, nathan), packs: [cat2] });
    assert.deepEqual(nathanTree.map((row) => row.id), ["madison"]);
    assert.equal(nathanTree[0]?.sites.some((site) => site.id === "site-madison" && site.jobs.some((job) => job.title.includes("CAT 2"))), true);
    assert.equal(nathanTree.some((row) => row.id === "cbi"), false);

    const beechTree = jobTree({ scope: johnBeech, jobs: jobsOnDesk([], [], false, johnBeech), packs: [] });
    assert.deepEqual(beechTree.map((row) => row.id), ["madison"]);

    const jamesJobs = jobsOnDesk([], dummyPacksForUser(james), false, james);
    const jamesTree = jobTree({ scope: james, jobs: jamesJobs, packs: dummyPacksForUser(james) });
    assert.deepEqual(jamesTree.map((row) => row.id), ["cbi"]);
    assert.equal(jamesTree[0]?.sites.some((site) => site.jobs.some((job) => job.title === "Shop sketch")), true);
    assert.equal(jamesTree.some((row) => row.id === "madison"), false);
    assert.equal(jamesTree[0]?.sites.some((site) => /yates|wood river/i.test(site.name)), false);

    const josephTree = jobTree({ scope: joseph, jobs: jobsOnDesk([], [], false, joseph), packs: [] });
    assert.deepEqual(josephTree.map((row) => row.id), ["hitsquad"]);
    assert.equal(josephTree[0]?.sites.some((site) => /yates|wood river/i.test(site.name) && site.id !== UNASSIGNED_SITE_ID), false);

    const henryTree = jobTree({ scope: johnHenry, jobs: jobsOnDesk([], [], false, johnHenry), packs: [] });
    assert.deepEqual(henryTree.map((row) => row.id), [LUCKY13_ID]);
    assert.equal(henryTree[0]?.sites.every((site) => !site.assigned || site.id === UNASSIGNED_SITE_ID), true);
  });

  it("opens a job card onto that job's estimate without changing Cat 2 identity", () => {
    const job = jobsOnDesk([], [cat2], false, nathan).find((row) => row.id === "job-new-mtaajdwa-f7539");
    assert.ok(job);
    assert.equal(companyIdForJob(job, nathan, cat2), "madison");
    assert.equal(jobEstimateHref(job, [], [cat2]), "/estimates/new-mtaajdwa-f7539");
    assert.equal(job.code, "EST-MTAAJD");
    const unit3 = seedJobs().find((row) => row.code === "TA-8841");
    assert.ok(unit3);
    assert.equal(jobEstimateHref(unit3, catalogEstimates()), "/estimates/est-u3");
  });

  it("keeps a handed Madison job on James's CBI desk without leaking the Madison company", () => {
    const handed = {
      packId: "new-handed-1",
      key: "new:new-handed-1",
      title: "Handed Madison job",
      client: "Madison / P66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 1,
      ownerEmail: JAMES_EMAIL,
    };
    const jobs = jobsOnDesk([], [handed], false, james);
    const tree = jobTree({ scope: james, jobs, packs: [handed] });
    assert.deepEqual(tree.map((row) => row.id), ["cbi"]);
    assert.equal(tree[0]?.sites.some((site) => site.jobs.some((job) => job.title === "Handed Madison job")), true);
    assert.equal(companyScopeFor({ email: JAMES_EMAIL, role: "tester" }, "cbi")?.companyId, "cbi");
  });

  it("keeps a standalone seat off the company tree", () => {
    const standalone = { isOwner: false, email: "added.standalone@example.com", companyId: STANDALONE_ID };
    const tree = jobTree({ scope: standalone, jobs: jobsOnDesk([], [cat2], false, standalone), packs: [cat2] });
    assert.deepEqual(tree.map((row) => row.id), []);
    assert.equal(tree.some((row) => row.id === STANDALONE_ID), false);
  });
});
