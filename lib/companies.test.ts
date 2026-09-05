import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANIES,
  LUCKY13_ID,
  LUCKY13_NAME,
  assignedCompaniesForId,
  canSeeCompany,
  catalogVisibleTo,
  companiesForScope,
  companyDeskLogoSrc,
  COMPANY_LOGO_BAD_TYPE,
  COMPANY_LOGO_MAX_ENCODED,
  COMPANY_LOGO_TOO_LARGE,
  inferCompanyId,
  assignmentChoices,
  isStandaloneId,
  mergeCompanies,
  validateCompanyLogoInput,
  peopleLane,
  samePeopleLane,
  seedCompanyForEmail,
  seedCompanyMap,
  STANDALONE_ID,
  STANDALONE_NAME,
} from "./companies.ts";
import {
  addCompany,
  assignedCompaniesForEmail,
  assignedCompany,
  peekAssignedCompany,
  companyDeskLogoForEmail,
  forgetCompanyCacheForTests,
  listCompanies,
  parseAssignmentFile,
  resetCompanyAssignmentsForTests,
  setAssignedCompany,
  setCompanyLogo,
  useCompanyVaultForTests,
  useMemoryCompanyAssignments,
} from "./companies-store.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { dummyPacksForUser } from "./cbi-dummy.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { boardForUser } from "./desk-data.ts";
import { COMPANIES_VAULT_KIND, COMPANIES_VAULT_NAME, writeVaultJson } from "./drive-data.ts";
import { jobsOnDesk, visibleSeedJobs } from "./jobs.ts";
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

  it("peeks local assignment without waiting on Drive", async () => {
    assert.equal(peekAssignedCompany("nathanboyte@gmail.com"), "madison");
    await setAssignedCompany(JAMES_EMAIL, "hitsquad");
    assert.equal(peekAssignedCompany(JAMES_EMAIL), "hitsquad");
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
    assert.equal(canSeeCompany(john, "madison"), true);
    assert.equal(canSeeCompany(john, "cbi"), false);
    assert.deepEqual(
      companiesForScope(johnHenry).map((row) => row.id),
      [LUCKY13_ID],
    );
  });

  it("hides Madison catalog from James and Hit Squad testers, and hides CBI from Madison", () => {
    assert.equal(inferCompanyId("Madison / P66"), "madison");
    assert.equal(inferCompanyId("Monroe Energy"), "madison");
    assert.equal(inferCompanyId("Trainer, PA"), "madison");
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
    assert.equal(ownerJobs.length, 0);
    assert.equal(ownerJobs.some((job) => job.id === "job-8841"), false);

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
    assert.equal(madisonBoard.sites.some((site) => site.name === "Monroe Energy"), true);
    assert.equal(madisonBoard.sites.some((site) => /coker pad/i.test(site.name)), false);
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

describe("company desk logo on file", () => {
  it("keeps a vault logo on Madison and does not invent one", async () => {
    assert.equal(COMPANIES.every((row) => !row.logo), true);
    const parsed = parseAssignmentFile({
      assignments: { "nathanboyte@gmail.com": "madison" },
      companies: [
        { id: "madison", name: "Madison", logo: "/madison.png" },
        { id: "cbi", name: "CBI", logo: "javascript:alert(1)" },
      ],
    });
    assert.equal(parsed.companies.find((row) => row.id === "madison")?.logo, "/madison.png");
    assert.equal(parsed.companies.find((row) => row.id === "cbi")?.logo, undefined);

    const merged = mergeCompanies(parsed.companies);
    assert.equal(merged.find((row) => row.id === "madison")?.logo, "/madison.png");
    assert.equal(merged.find((row) => row.id === "hitsquad")?.logo, undefined);
    assert.equal(companyDeskLogoSrc(assignedCompaniesForId("madison", merged)), "/madison.png");
    assert.equal(companyDeskLogoSrc(assignedCompaniesForId("hitsquad", merged)), null);
    assert.equal(
      companyDeskLogoSrc([
        { logo: "/madison.png" },
        { logo: "/cbi.png" },
      ]),
      null,
    );

    useMemoryCompanyAssignments();
    assert.equal(await assignedCompany("nathanboyte@gmail.com"), "madison");
    assert.deepEqual((await assignedCompaniesForEmail("nathanboyte@gmail.com")).map((row) => row.id), ["madison"]);
    assert.equal(await companyDeskLogoForEmail("nathanboyte@gmail.com"), null);

    const drive = memoryDrive();
    await writeVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND, {
      assignments: { "nathanboyte@gmail.com": "madison" },
      companies: [{ id: "madison", name: "Madison", logo: "/madison.png" }],
    });
    forgetCompanyCacheForTests();
    useCompanyVaultForTests(drive);
    assert.equal((await listCompanies()).find((row) => row.id === "madison")?.logo, "/madison.png");
    assert.equal(await companyDeskLogoForEmail("nathanboyte@gmail.com"), "/madison.png");
    assert.equal(await companyDeskLogoForEmail(OWNER_LOGIN_EMAIL), null);
  });

  it("lets the owner set and clear a vault logo without inventing one", async () => {
    const tiny =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    useMemoryCompanyAssignments();
    assert.equal((await listCompanies()).find((row) => row.id === "madison")?.logo, undefined);

    const saved = await setCompanyLogo("madison", tiny);
    assert.equal("ok" in saved, true);
    if (!("ok" in saved)) return;
    assert.equal(saved.company.logo, tiny);
    assert.equal((await listCompanies()).find((row) => row.id === "madison")?.logo, tiny);
    assert.equal(await companyDeskLogoForEmail("nathanboyte@gmail.com"), tiny);

    const cleared = await setCompanyLogo("madison", null);
    assert.equal("ok" in cleared, true);
    if (!("ok" in cleared)) return;
    assert.equal(cleared.company.logo, undefined);
    assert.equal((await listCompanies()).find((row) => row.id === "madison")?.logo, undefined);
    assert.equal(await companyDeskLogoForEmail("nathanboyte@gmail.com"), null);

    const svg = await setCompanyLogo("madison", "data:image/svg+xml;base64,PHN2Zy8+");
    assert.equal("error" in svg, true);
    if ("error" in svg) assert.equal(svg.error, COMPANY_LOGO_BAD_TYPE);
    const junk = await setCompanyLogo("madison", "javascript:alert(1)");
    assert.equal("error" in junk, true);
    const missing = await setCompanyLogo("notacompany", tiny);
    assert.equal("error" in missing, true);
    const door = await setCompanyLogo(STANDALONE_ID, tiny);
    assert.equal("error" in door, true);
    assert.equal((await listCompanies()).find((row) => row.id === "madison")?.logo, undefined);

    const huge = `data:image/png;base64,${"A".repeat(COMPANY_LOGO_MAX_ENCODED)}`;
    assert.equal("error" in validateCompanyLogoInput(huge) && validateCompanyLogoInput(huge).error, COMPANY_LOGO_TOO_LARGE);
    assert.equal("logo" in validateCompanyLogoInput(tiny) && validateCompanyLogoInput(tiny).logo, tiny);
    assert.equal("logo" in validateCompanyLogoInput(null) && validateCompanyLogoInput(null).logo, null);

    const drive = memoryDrive();
    useCompanyVaultForTests(drive);
    const vaulted = await setCompanyLogo("madison", tiny);
    assert.equal("ok" in vaulted, true);
    forgetCompanyCacheForTests();
    useCompanyVaultForTests(drive);
    assert.equal((await listCompanies()).find((row) => row.id === "madison")?.logo, tiny);
  });

  it("Settings Branding manages live company logos on the vault", () => {
    const desk = readFileSync(fileURLToPath(new URL("../components/BrandingDesk.tsx", import.meta.url)), "utf8");
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/companies/logo/route.ts", import.meta.url)), "utf8");
    const store = readFileSync(fileURLToPath(new URL("./companies-store.ts", import.meta.url)), "utf8");
    assert.match(desk, /type="file"/);
    assert.match(desk, /Upload/);
    assert.match(desk, /Change/);
    assert.match(desk, /Remove/);
    assert.match(desk, /No logo/);
    assert.match(desk, /\/api\/desk\/companies\/logo/);
    assert.equal(/HIT SQUAD over PROJECT CONTROLS/.test(desk), false);
    assert.match(api, /setCompanyLogo/);
    assert.match(api, /isOwner/);
    assert.match(api, /hasBuildDesk/);
    assert.match(store, /setCompanyLogo/);
    assert.match(store, /validateCompanyLogoInput/);
    assert.match(store, /COMPANIES_VAULT/);
  });
});

describe("standalone door vs company people", () => {
  it("keeps Standalone off the company catalog and splits people lanes", () => {
    assert.equal(isStandaloneId(STANDALONE_ID), true);
    assert.equal(peopleLane(STANDALONE_ID), "standalone");
    assert.equal(peopleLane("madison"), "company");
    assert.equal(samePeopleLane("madison", "cbi"), true);
    assert.equal(samePeopleLane("madison", STANDALONE_ID), false);
    assert.equal(COMPANIES.some((row) => row.id === STANDALONE_ID), false);
    assert.deepEqual(
      assignmentChoices().map((row) => row.id).slice(-1),
      [STANDALONE_ID],
    );
    assert.equal(assignmentChoices().find((row) => row.id === STANDALONE_ID)?.name, STANDALONE_NAME);
    const solo = { isOwner: false, email: "added.standalone@example.com", companyId: STANDALONE_ID };
    assert.deepEqual(companiesForScope(solo).map((row) => row.id), []);
    assert.equal(canSeeCompany(solo, "madison"), false);
    assert.equal(canSeeCompany(solo, STANDALONE_ID), false);
    assert.equal(canSeeCompany(owner, STANDALONE_ID), false);
    assert.equal(canSeeCompany(owner, "madison"), true);
  });

  it("lets the owner assign Standalone without adding it as a company", async () => {
    await setAssignedCompany(JOSEPH_EMAIL, STANDALONE_ID);
    assert.equal(await assignedCompany(JOSEPH_EMAIL), STANDALONE_ID);
    const blocked = await addCompany(STANDALONE_NAME);
    assert.equal("error" in blocked, true);
    assert.equal((await listCompanies()).some((row) => row.id === STANDALONE_ID), false);
  });
});
