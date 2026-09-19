import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CBI_ID,
  COMPANIES,
  LUCKY13_ID,
  LUCKY13_NAME,
  assignedCompaniesForId,
  canSeeCompany,
  catalogVisibleTo,
  companiesForScope,
  companiesListedForViewer,
  companyDirectoryPayload,
  isPlatformCompanyAdmin,
  companyHasDispatch,
  companyHasModule,
  compactCompanyModules,
  COMPANY_MODULE_KEYS,
  companyScopeFor,
  companyDeskLogoSrc,
  COMPANY_LOGO_BAD_TYPE,
  COMPANY_LOGO_MAX_ENCODED,
  COMPANY_LOGO_TOO_LARGE,
  DEFAULT_COMPANY_MODULES,
  inferCompanyId,
  parseCompanyModulePatch,
  parseCompanyModules,
  parseCompanyShortName,
  isRetiredPeerCompany,
  isRetiredPeerPack,
  assignmentChoices,
  isStandaloneId,
  mergeCompanies,
  validateCompanyLogoInput,
  peopleLane,
  samePeopleLane,
  seesSiblingCompanyIdentity,
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
  updateCompany,
  useCompanyVaultForTests,
  useMemoryCompanyAssignments,
} from "./companies-store.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { dummyPacksForUser } from "./cbi-dummy.ts";
import { catalogSites } from "./desk-data.ts";
import {
  COMPANY_MODULE_CATALOG,
  companyModuleCatalogCoversHomeDock,
  companyModuleCatalogKeys,
  sitesForCompany,
  toCompanySetupSite,
} from "./company-setup.ts";
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
  it("lists Hit Squad and Madison only — CBI and Lucky 13 stay off the catalog", () => {
    assert.deepEqual(
      COMPANIES.map((row) => row.id),
      ["hitsquad", "madison"],
    );
    assert.equal(COMPANIES.some((row) => row.id === CBI_ID || row.id === LUCKY13_ID), false);
    assert.equal(isRetiredPeerCompany(CBI_ID), true);
    assert.equal(isRetiredPeerCompany(LUCKY13_ID), true);
    assert.equal(mergeCompanies([{ id: CBI_ID, name: "CBI" }, { id: LUCKY13_ID, name: LUCKY13_NAME }]).some((row) => row.id === CBI_ID || row.id === LUCKY13_ID), false);
    assert.equal(assignmentChoices().some((row) => row.id === CBI_ID || row.id === LUCKY13_ID), false);
    assert.equal(isRetiredPeerPack({ packId: "new-cbi-shape-1", client: "CBI", title: "Shop sketch" }), true);
    assert.equal(isRetiredPeerPack({ client: LUCKY13_NAME, title: "Yard fab" }), true);
    assert.equal(isRetiredPeerPack({ client: "Phillips 66", title: "Madison CAT 2 (Pit Stop)", site: "Wood River" }), false);
  });

  it("keeps James and John Henry seats parked off Madison, everyone else Hit Squad or Madison", () => {
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

  it("lets the owner see Hit Squad and Madison, and parks retired peer seats off the catalog", () => {
    assert.deepEqual(
      companiesForScope(owner).map((row) => row.id),
      ["hitsquad", "madison"],
    );
    assert.deepEqual(
      companiesForScope(nathan).map((row) => row.id),
      ["madison"],
    );
    assert.deepEqual(
      companiesForScope(james).map((row) => row.id),
      [],
    );
    assert.equal(canSeeCompany(joseph, "madison"), false);
    assert.equal(canSeeCompany(joseph, CBI_ID), false);
    assert.equal(canSeeCompany(novus, "hitsquad"), true);
    assert.equal(canSeeCompany(johnHenry, LUCKY13_ID), true);
    assert.equal(canSeeCompany(johnHenry, "madison"), false);
    assert.equal(canSeeCompany(nathan, LUCKY13_ID), false);
    assert.equal(canSeeCompany(john, "madison"), true);
    assert.equal(canSeeCompany(john, CBI_ID), false);
    assert.deepEqual(
      companiesForScope(johnHenry).map((row) => row.id),
      [],
    );
    const president = companyScopeFor({ email: "president.example@example.com", role: "president" }, "hitsquad");
    assert.equal(president?.companyId, "madison");
    assert.deepEqual(
      companiesForScope(president).map((row) => row.id),
      ["madison"],
    );
    assert.equal(canSeeCompany(president, "hitsquad"), false);
  });

  it("hides Madison catalog from James and Hit Squad testers, and hides CBI from Madison", () => {
    assert.equal(inferCompanyId("Madison / P66"), "madison");
    assert.equal(inferCompanyId("Monroe Energy"), "madison");
    assert.equal(inferCompanyId("Trainer, PA"), "madison");
    assert.equal(inferCompanyId("Rodeo U110"), "madison");
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
    assert.equal(jamesDesk.some((job) => job.title === "Shop sketch"), false);
    assert.equal(jamesDesk.some((job) => /cbi|lucky\s*13/i.test(`${job.client} ${job.title}`)), false);

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

  it("does not seed a CBI shop sketch on any seat", () => {
    assert.deepEqual(dummyPacksForUser(james), []);
    assert.deepEqual(dummyPacksForUser(nathan), []);
    assert.deepEqual(dummyPacksForUser(owner), []);
    assert.deepEqual(dummyPacksForUser(johnHenry), []);
  });

  it("lets the owner add a company onto the live list and assign it", async () => {
    const added = await addCompany("Acme Field Services");
    assert.equal("ok" in added, true);
    if (!("ok" in added)) return;
    assert.equal(added.company.name, "Acme Field Services");
    assert.equal((await listCompanies()).some((row) => row.id === added.company.id), true);
    assert.equal((await listCompanies()).some((row) => row.name === LUCKY13_NAME), false);
    await setAssignedCompany(JOHN_HENRY_EMAIL, added.company.id);
    assert.equal(await assignedCompany(JOHN_HENRY_EMAIL), added.company.id);
    const again = await addCompany(LUCKY13_NAME);
    assert.equal("error" in again, true);
    assert.equal((await listCompanies()).some((row) => row.id === LUCKY13_ID), false);
    const cbi = await addCompany("CBI");
    assert.equal("error" in cbi, true);
    assert.equal((await listCompanies()).some((row) => row.id === CBI_ID), false);
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
    assert.equal(parsed.companies.some((row) => row.id === "cbi" || row.id === LUCKY13_ID), false);

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
    assert.match(desk, /type="url"/);
    assert.match(desk, /Use URL/);
    assert.match(desk, /Control Center header/);
    assert.match(desk, /Upload/);
    assert.match(desk, /Change/);
    assert.match(desk, /Remove/);
    assert.match(desk, /No logo/);
    assert.match(desk, /\/api\/desk\/companies\/logo/);
    assert.equal(/HIT SQUAD over PROJECT CONTROLS/.test(desk), false);
    assert.match(api, /setCompanyLogo/);
    assert.match(api, /isOwner/);
    assert.match(api, /hasWorkingDesk/);
    assert.match(store, /setCompanyLogo/);
    assert.match(store, /validateCompanyLogoInput/);
    assert.match(store, /COMPANIES_VAULT/);
  });
});

describe("company identity and module catalog vault", () => {
  it("migrates missing shortName / modules to all-on and keeps Madison usable", () => {
    const parsed = parseAssignmentFile({
      assignments: { "nathanboyte@gmail.com": "madison" },
      companies: [{ id: "madison", name: "Madison", logo: "/madison.png" }],
    });
    const madison = parsed.companies.find((row) => row.id === "madison");
    assert.equal(madison?.shortName, undefined);
    assert.equal(madison?.modules, undefined);
    const migrated = parseCompanyModules(madison?.modules);
    assert.deepEqual(migrated, DEFAULT_COMPANY_MODULES);
    for (const key of COMPANY_MODULE_KEYS) {
      assert.equal(migrated[key], true);
      assert.equal(companyHasModule(madison, key), true);
    }
    assert.equal(companyHasDispatch(madison), true);
    assert.equal(companyHasDispatch(undefined), true);
    assert.equal(compactCompanyModules(DEFAULT_COMPANY_MODULES), undefined);
    assert.deepEqual(compactCompanyModules({ ...DEFAULT_COMPANY_MODULES, quality: false }), { quality: false });
    assert.deepEqual(parseCompanyModulePatch({ quality: false, extra: true, jobs: "no" }), { quality: false });
    assert.deepEqual(parseCompanyModulePatch(null), {});
    assert.equal(parseCompanyShortName("  Acme Field  "), "Acme Field");
    assert.equal(parseCompanyShortName(""), undefined);
    const catalog = catalogSites().map(toCompanySetupSite);
    assert.equal(catalog.some((site) => site.companyId === "madison" && /wood river/i.test(site.name)), true);
    assert.equal(sitesForCompany("acme", catalog).length, 0);
    assert.equal(sitesForCompany("madison", catalog).length > 0, true);
    assert.deepEqual(companyModuleCatalogKeys(), [...COMPANY_MODULE_KEYS]);
    assert.equal(companyModuleCatalogCoversHomeDock(), true);
    assert.equal(COMPANY_MODULE_CATALOG.some((row) => row.catalogLabel === "Included"), true);
    assert.equal(COMPANY_MODULE_CATALOG.some((row) => row.catalogLabel === "Add-on"), true);
    assert.equal(COMPANY_MODULE_CATALOG.some((row) => row.catalogLabel === "Not open for trial"), true);

    const off = parseAssignmentFile({
      assignments: {},
      companies: [{
        id: "acme",
        name: "Acme Field Services",
        shortName: "Acme",
        modules: { dispatch: false, quality: false },
      }],
    });
    assert.equal(off.companies[0]?.shortName, "Acme");
    assert.equal(off.companies[0]?.modules?.dispatch, false);
    assert.equal(off.companies[0]?.modules?.quality, false);
    assert.equal(companyHasDispatch(off.companies[0]), false);
    assert.equal(companyHasModule(off.companies[0], "quality"), false);
    assert.equal(companyHasModule(off.companies[0], "jobs"), true);
    assert.equal(companyHasModule(off.companies[0], "hse"), true);
    assert.equal(companyHasModule(off.companies[0], "accounting"), true);
  });

  it("lets the owner set short name and turn modules off without flipping Madison", async () => {
    useMemoryCompanyAssignments();
    const added = await addCompany("Acme Field Services", { shortName: "Acme" });
    assert.equal("ok" in added, true);
    if (!("ok" in added)) return;
    assert.equal(added.company.shortName, "Acme");
    assert.equal(companyHasDispatch(added.company), true);
    assert.equal(companyHasModule(added.company, "quality"), true);
    assert.equal(added.company.modules, undefined);

    const off = await updateCompany(added.company.id, { modules: { dispatch: false, quality: false } });
    assert.equal("ok" in off, true);
    if (!("ok" in off)) return;
    assert.equal(off.company.modules?.dispatch, false);
    assert.equal(off.company.modules?.quality, false);
    assert.equal(off.company.modules?.jobs, undefined);
    const stored = (await listCompanies()).find((row) => row.id === added.company.id);
    assert.equal(companyHasDispatch(stored), false);
    assert.equal(companyHasModule(stored, "quality"), false);
    assert.equal(companyHasModule(stored, "jobs"), true);

    const madison = (await listCompanies()).find((row) => row.id === "madison");
    assert.equal(madison?.modules, undefined);
    for (const key of COMPANY_MODULE_KEYS) {
      assert.equal(companyHasModule(madison, key), true);
    }
    const renamed = await updateCompany("madison", { shortName: "MLI" });
    assert.equal("ok" in renamed, true);
    if (!("ok" in renamed)) return;
    assert.equal(renamed.company.shortName, "MLI");
    assert.equal(renamed.company.modules, undefined);
    assert.equal(companyHasDispatch(renamed.company), true);
    assert.equal(companyHasModule(renamed.company, "quality"), true);
  });

  it("wires Owner Company Setup onto Settings and reuses seats / site-access / logo", () => {
    const shell = readFileSync(fileURLToPath(new URL("../components/SettingsShell.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/settings/companies/page.tsx", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/CompanySetupDesk.tsx", import.meta.url)), "utf8");
    const catalog = readFileSync(fileURLToPath(new URL("./company-setup.ts", import.meta.url)), "utf8");
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/companies/route.ts", import.meta.url)), "utf8");
    const dock = readFileSync(fileURLToPath(new URL("../components/HomeDock.tsx", import.meta.url)), "utf8");
    const onboardApi = readFileSync(fileURLToPath(new URL("../app/api/desk/onboard/route.ts", import.meta.url)), "utf8");
    assert.match(shell, /href: "\/settings\/companies"/);
    assert.match(shell, /label: "Company Setup"/);
    assert.match(shell, /ownerOnly: true/);
    assert.match(page, /SettingsGate ownerOnly/);
    assert.match(desk, /Create company/);
    assert.match(desk, /COMPANY_MODULE_CATALOG/);
    assert.match(desk, /Included/);
    assert.match(desk, /Add-on/);
    assert.match(desk, /Not open for trial/);
    assert.match(desk, /onToggleModule/);
    assert.match(catalog, /Dispatch \/ Control Center/);
    assert.match(catalog, /catalogLabel: "Included"/);
    assert.match(catalog, /catalogLabel: "Add-on"/);
    assert.match(catalog, /catalogLabel: "Not open for trial"/);
    assert.equal(COMPANY_MODULE_CATALOG.find((row) => row.key === "dispatch")?.label, "Dispatch / Control Center");
    assert.match(desk, /\/api\/desk\/seats/);
    assert.match(desk, /grant-site-access/);
    assert.match(desk, /\/api\/desk\/companies\/logo/);
    assert.match(api, /updateCompany/);
    assert.match(api, /parseCompanyModulePatch/);
    assert.match(api, /isOwner/);
    assert.match(dock, /homeDockTilesForViewer/);
    assert.match(dock, /\/api\/desk\/companies/);
    assert.match(onboardApi, /DISPATCH_DENIED/);
    assert.match(onboardApi, /canOpenDispatchModule/);
    const gate = readFileSync(fileURLToPath(new URL("../components/CompanyModuleGate.tsx", import.meta.url)), "utf8");
    const jobsPage = readFileSync(fileURLToPath(new URL("../app/jobs/page.tsx", import.meta.url)), "utf8");
    const qualityPage = readFileSync(fileURLToPath(new URL("../app/quality/page.tsx", import.meta.url)), "utf8");
    const hsePage = readFileSync(fileURLToPath(new URL("../app/hse/page.tsx", import.meta.url)), "utf8");
    const accountingPage = readFileSync(fileURLToPath(new URL("../app/accounting/page.tsx", import.meta.url)), "utf8");
    const jobsApi = readFileSync(fileURLToPath(new URL("../app/api/desk/jobs/route.ts", import.meta.url)), "utf8");
    assert.match(gate, /canOpenCompanyModule/);
    assert.match(gate, /companyModuleDenied/);
    assert.match(jobsPage, /CompanyModuleGate module="jobs"/);
    assert.match(qualityPage, /CompanyModuleGate module="quality"/);
    assert.match(hsePage, /CompanyModuleGate module="hse"/);
    assert.match(accountingPage, /CompanyModuleGate module="accounting"/);
    assert.match(jobsApi, /JOBS_DENIED/);
    assert.match(jobsApi, /canOpenCompanyModule/);
    assert.match(api, /companyDirectoryPayload/);
    assert.match(api, /platformAdmin/);
  });

  it("never lists sibling company identity to a company seat or View-as lens", () => {
    const catalog = mergeCompanies([{ id: "acme", name: "Acme Field Services", shortName: "Acme" }]);
    const nathanViewer = { email: "nathanboyte@gmail.com", role: "tester" };
    const ownerViewer = { email: OWNER_LOGIN_EMAIL, role: "owner" };
    const nathanListed = companiesListedForViewer(nathanViewer, catalog);
    const nathanPayload = companyDirectoryPayload(nathanViewer, catalog, "madison");
    const ownerListed = companiesListedForViewer(ownerViewer, catalog);

    assert.deepEqual(nathanListed.map((row) => row.id), ["madison"]);
    assert.equal(nathanListed.some((row) => row.id === "hitsquad" || row.id === "acme"), false);
    assert.equal(nathanListed.some((row) => /acme|hit squad/i.test(`${row.name} ${row.shortName || ""}`)), false);
    assert.equal(nathanPayload.companies.length, 1);
    assert.equal(nathanPayload.company?.id, "madison");
    assert.equal(JSON.stringify(nathanPayload).includes("hitsquad"), false);
    assert.equal(JSON.stringify(nathanPayload).includes("Acme"), false);
    assert.equal(seesSiblingCompanyIdentity(nathanViewer, catalog), false);
    assert.equal(seesSiblingCompanyIdentity(ownerViewer, catalog), true);
    assert.equal(isPlatformCompanyAdmin(ownerViewer, ownerViewer), true);
    assert.equal(isPlatformCompanyAdmin(ownerViewer, nathanViewer), false);
    assert.equal(isPlatformCompanyAdmin(nathanViewer, nathanViewer), false);
    const josephViewer = { email: JOSEPH_EMAIL, role: "tester" };
    const josephPayload = companyDirectoryPayload(josephViewer, catalog, "hitsquad");
    assert.deepEqual(josephPayload.companies.map((row) => row.id), ["hitsquad"]);
    assert.equal(JSON.stringify(josephPayload).includes("madison"), false);
    assert.equal(JSON.stringify(josephPayload).includes("Acme"), false);
    assert.equal(seesSiblingCompanyIdentity(josephViewer, catalog), false);
    assert.equal(ownerListed.some((row) => row.id === "madison"), true);
    assert.equal(ownerListed.some((row) => row.id === "hitsquad"), true);
    assert.equal(ownerListed.some((row) => row.id === "acme"), true);

    const gate = readFileSync(fileURLToPath(new URL("../components/SettingsGate.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/settings/companies/page.tsx", import.meta.url)), "utf8");
    const logoApi = readFileSync(fileURLToPath(new URL("../app/api/desk/companies/logo/route.ts", import.meta.url)), "utf8");
    assert.match(page, /SettingsGate ownerOnly/);
    assert.match(gate, /lensOk/);
    assert.match(logoApi, /companiesListedForViewer/);
    const seatsApi = readFileSync(fileURLToPath(new URL("../app/api/desk/seats/route.ts", import.meta.url)), "utf8");
    assert.match(seatsApi, /companiesListedForViewer/);
    assert.match(seatsApi, /companiesForActor/);
    assert.match(seatsApi, /seatsListedForViewer/);
    assert.match(seatsApi, /scopedDeskUser/);
    const divisionsApi = readFileSync(fileURLToPath(new URL("../app/api/desk/divisions/route.ts", import.meta.url)), "utf8");
    assert.match(divisionsApi, /companiesListedForViewer/);
    assert.match(divisionsApi, /scopedDeskUser/);
    assert.match(logoApi, /scopedDeskUser/);
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
