import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";

import {
  COMPANIES,
  LUCKY13_ID,
  LUCKY13_NAME,
  canSeeCompany,
  catalogVisibleTo,
  companiesForScope,
  inferCompanyId,
  seedCompanyForEmail,
  seedCompanyMap,
} from "./companies.ts";
import {
  addCompany,
  assignedCompany,
  forgetCompanyCacheForTests,
  listCompanies,
  resetCompanyAssignmentsForTests,
  setAssignedCompany,
  useCompanyVaultForTests,
} from "./companies-store.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { dummyPacksForUser } from "./cbi-dummy.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { boardForUser } from "./desk-data.ts";
import { jobsOnDesk, seedJobs, visibleSeedJobs } from "./jobs.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JAMES_EMAIL, JOHN_BEECH_EMAIL, JOHN_HENRY_EMAIL, JOSEPH_EMAIL, TESTER_SEATS } from "./tester-seats.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-companies-"));
process.env.COMPANY_ASSIGNMENT_PATH = join(dir, "companies.json");

const owner = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
const nathan = { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" as const };
const john = { isOwner: false, email: JOHN_BEECH_EMAIL, companyId: "madison" as const };
const james = { isOwner: false, email: JAMES_EMAIL, companyId: "cbi" as const };
const joseph = { isOwner: false, email: JOSEPH_EMAIL, companyId: "hitsquad" as const };
const johnHenry = { isOwner: false, email: JOHN_HENRY_EMAIL, companyId: "lucky13" as const };
const novus = { isOwner: false, email: NOVUS_EMAIL, companyId: "hitsquad" as const };

beforeEach(() => {
  resetCompanyAssignmentsForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("company catalog and seed", () => {
  it("lists Hit Squad, Madison, CBI, and Lucky 13", () => {
    assert.deepEqual(
      COMPANIES.map((row) => row.id),
      ["hitsquad", "madison", "cbi", LUCKY13_ID],
    );
    assert.equal(COMPANIES.find((row) => row.id === "cbi")?.name, "CBI");
    assert.equal(COMPANIES.find((row) => row.id === LUCKY13_ID)?.name, LUCKY13_NAME);
  });

  it("seeds Nathan and John on Madison, James on CBI, everyone else Hit Squad", () => {
    assert.equal(seedCompanyForEmail("nathanboyte@gmail.com"), "madison");
    assert.equal(seedCompanyForEmail(JOHN_BEECH_EMAIL), "madison");
    assert.equal(seedCompanyForEmail(JAMES_EMAIL), "cbi");
    assert.equal(seedCompanyForEmail(JOSEPH_EMAIL), "hitsquad");
    assert.equal(seedCompanyForEmail("marks544@yahoo.com"), "hitsquad");
    assert.equal(seedCompanyForEmail("wlanderno@yahoo.com"), "hitsquad");
    assert.equal(seedCompanyForEmail(NOVUS_EMAIL), "hitsquad");
    assert.equal(seedCompanyForEmail(OWNER_LOGIN_EMAIL), "hitsquad");
    assert.equal(seedCompanyForEmail(JOHN_HENRY_EMAIL), "lucky13");
    const map = seedCompanyMap();
    assert.equal(map[JOHN_BEECH_EMAIL], "madison");
    assert.equal(map[JAMES_EMAIL], "cbi");
    assert.equal(
      TESTER_SEATS.filter((row) => row.company === "madison").map((row) => row.email).sort().join(),
      [JOHN_BEECH_EMAIL, "nathanboyte@gmail.com"].sort().join(),
    );
    assert.equal(
      TESTER_SEATS.filter((row) => row.company === "cbi").map((row) => row.email).join(),
      JAMES_EMAIL,
    );
  });

  it("keeps John Beech and James on the locked emails", () => {
    assert.equal(JOHN_BEECH_EMAIL, "johnbeech.madison@gmail.com");
    assert.equal(JAMES_EMAIL, "jameshcainjr@gmail.com");
    assert.equal(
      TESTER_SEATS.some((row) => row.email === "beechj@madisonltd.com"),
      false,
    );
  });
});

describe("assign and visibility", () => {
  it("persists a company change and treats change as the reverse of assign", async () => {
    assert.equal(await assignedCompany(JAMES_EMAIL), "cbi");
    await setAssignedCompany(JAMES_EMAIL, "hitsquad");
    assert.equal(await assignedCompany(JAMES_EMAIL), "hitsquad");
    await setAssignedCompany(JAMES_EMAIL, "cbi");
    assert.equal(await assignedCompany(JAMES_EMAIL), "cbi");
  });

  it("lets the owner see every company and testers only their assigned one", () => {
    assert.deepEqual(
      companiesForScope(owner).map((row) => row.id),
      ["hitsquad", "madison", "cbi", LUCKY13_ID],
    );
    assert.deepEqual(
      companiesForScope(nathan).map((row) => row.id),
      ["madison"],
    );
    assert.deepEqual(
      companiesForScope(james).map((row) => row.id),
      ["cbi"],
    );
    assert.equal(canSeeCompany(joseph, "madison"), false);
    assert.equal(canSeeCompany(joseph, "cbi"), false);
    assert.equal(canSeeCompany(novus, "hitsquad"), true);
    assert.equal(canSeeCompany(owner, "cbi"), true);
    assert.equal(canSeeCompany(owner, LUCKY13_ID), true);
    assert.equal(canSeeCompany(johnHenry, LUCKY13_ID), true);
    assert.equal(canSeeCompany(johnHenry, "madison"), false);
    assert.equal(canSeeCompany(nathan, LUCKY13_ID), false);
    assert.deepEqual(
      companiesForScope(johnHenry).map((row) => row.id),
      [LUCKY13_ID],
    );
  });

  it("hides Madison catalog from James and Hit Squad testers, and hides CBI from Madison", () => {
    assert.equal(inferCompanyId("Madison / P66"), "madison");
    assert.equal(inferCompanyId("CBI"), "cbi");
    assert.equal(catalogVisibleTo(nathan, "Madison / P66", "TA-8841"), true);
    assert.equal(catalogVisibleTo(james, "Madison / P66", "TA-8841"), false);
    assert.equal(catalogVisibleTo(joseph, "Madison / P66", "Wood River"), false);
    assert.equal(catalogVisibleTo(james, "CBI", "Shop sketch"), true);
    assert.equal(catalogVisibleTo(nathan, "CBI", "Shop sketch"), false);

    const nathanJobs = visibleSeedJobs(nathan);
    assert.equal(nathanJobs.some((job) => job.code === "TA-8841"), true);
    assert.equal(nathanJobs.some((job) => /cbi/i.test(job.client)), false);

    const jamesSeeds = visibleSeedJobs(james);
    assert.equal(jamesSeeds.some((job) => job.code === "TA-8841"), false);
    assert.equal(jamesSeeds.length, 0);

    const josephSeeds = visibleSeedJobs(joseph);
    assert.equal(josephSeeds.some((job) => job.code === "TA-8841"), false);
    assert.equal(josephSeeds.some((job) => job.id === "job-8710"), true);
    const henrySeeds = visibleSeedJobs(johnHenry);
    assert.equal(henrySeeds.some((job) => job.code === "TA-8841"), false);
    assert.equal(henrySeeds.length, 0);

    const ownerJobs = jobsOnDesk([], [], false, owner);
    assert.equal(ownerJobs.length, seedJobs().length);

    const jamesDesk = jobsOnDesk([], [], false, james);
    assert.equal(jamesDesk.some((job) => job.code === "TA-8841"), false);
    assert.equal(jamesDesk.some((job) => job.title === "Shop sketch"), true);

    const transferred = {
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
    const afterHandoff = jobsOnDesk([], [transferred], false, james);
    assert.equal(afterHandoff.some((job) => job.title === "Handed Madison job"), true);

    const madisonBoard = boardForUser("tester-nathan", nathan);
    assert.equal(madisonBoard.sites.some((site) => site.name === "Wood River"), true);
    const jamesBoard = boardForUser("tester-james", james);
    assert.equal(jamesBoard.sites.length, 0);
    assert.equal(jamesBoard.estimates.length, 0);
    const ownerBoard = boardForUser("owner-robert-henderson", owner);
    assert.equal(ownerBoard.sites.length > 0, true);
  });

  it("seeds a CBI shop sketch on James only, without live Cat 2 or plant dollars", () => {
    const dummy = dummyPacksForUser(james);
    assert.equal(dummy.length, 1);
    assert.equal(dummy[0].client, "CBI");
    assert.equal(dummy[0].packId, "new-cbi-shape-1");
    assert.equal(/shahan|comp|p66|madison|mtaajd/i.test(JSON.stringify(dummy[0])), false);
    assert.deepEqual(dummyPacksForUser(nathan), []);
    assert.deepEqual(dummyPacksForUser(owner), []);
  });

  it("lets the owner add a company onto the live list and assign it", async () => {
    const added = await addCompany("Acme Field Services");
    assert.equal("ok" in added, true);
    if (!("ok" in added)) return;
    assert.equal(added.company.name, "Acme Field Services");
    assert.equal((await listCompanies()).some((row) => row.id === added.company.id), true);
    assert.equal((await listCompanies()).some((row) => row.name === LUCKY13_NAME), true);
    await setAssignedCompany(JOHN_HENRY_EMAIL, added.company.id);
    assert.equal(await assignedCompany(JOHN_HENRY_EMAIL), added.company.id);
    const again = await addCompany(LUCKY13_NAME);
    assert.equal("ok" in again, true);
    if ("ok" in again) assert.equal(again.company.id, LUCKY13_ID);
  });

  it("keeps a custom company and assignment after the local cache is wiped", async () => {
    const drive = memoryDrive();
    useCompanyVaultForTests(drive);
    const added = await addCompany("Acme Field Services");
    assert.equal("ok" in added, true);
    if (!("ok" in added)) return;
    await setAssignedCompany(JOSEPH_EMAIL, added.company.id);
    forgetCompanyCacheForTests();
    useCompanyVaultForTests(drive);
    const listed = await listCompanies();
    assert.equal(listed.some((row) => row.id === added.company.id), true);
    assert.equal(listed.some((row) => row.id === "hitsquad"), true);
    assert.equal(listed.some((row) => row.id === "madison"), true);
    assert.equal(await assignedCompany(JOSEPH_EMAIL), added.company.id);
    assert.equal(await assignedCompany(JAMES_EMAIL), "cbi");
  });
});
