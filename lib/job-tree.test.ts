import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { COMPANIES, LUCKY13_ID, STANDALONE_ID, companyScopeFor } from "./companies.ts";
import { dummyPacksForUser } from "./cbi-dummy.ts";
import { catalogEstimates } from "./desk-data.ts";
import { jobsOnDesk, seedJobs, seedJobsAllowed } from "./jobs.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  assignedSiteIds,
  clientIdForSite,
  clientTreeKey,
  companyIdForJob,
  defaultCollapsedClientKeys,
  defaultOpenCompanyId,
  GEORGIA_POWER_CLIENT_ID,
  JOB_TREE_CLIENT_SITE_IDS,
  jobEstimateHref,
  jobTree,
  jobTreeClientId,
  matchCatalogSite,
  PHILLIPS_66_CLIENT_ID,
  resolveClientOpen,
  resolveOpenCompanyId,
  resolveSiteOpen,
  siteIsCollapsible,
  siteTreeKey,
  sitesForCompany,
  stickyOpenCompanyId,
  toggleCollapsedClient,
  toggleCollapsedSite,
  toggleOpenCompanyId,
  UNASSIGNED_SITE_ID,
} from "./job-tree.ts";
import { BOILER17_PACK_ID, BOILER17_TITLE } from "./boiler-17.ts";
import { RODEO_U110_PACK_ID, rodeoMonroeWakeCards } from "./rodeo-monroe-wake.ts";
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

const boiler17 = {
  packId: BOILER17_PACK_ID,
  key: `new:${BOILER17_PACK_ID}`,
  title: BOILER17_TITLE,
  client: "Phillips 66",
  site: "Wood River — Roxana, IL",
  siteId: "site-madison",
  createdAt: 1,
  updatedAt: 2,
  ownerEmail: "nathanboyte@gmail.com",
  status: "Locked" as const,
};

describe("job tree", () => {
  it("opens Madison by default and keeps Yates as a Madison catalog site", () => {
    assert.equal(defaultOpenCompanyId(COMPANIES), "madison");
    assert.equal(defaultOpenCompanyId([{ id: "cbi" }]), "cbi");
    assert.equal(sitesForCompany("madison").some((site) => site.id === "site-madison"), true);
    assert.equal(sitesForCompany("madison").some((site) => site.id === "site-yates"), true);
    assert.equal(sitesForCompany("madison").some((site) => site.id === "site-monroe" && site.name === "Monroe Energy"), true);
    assert.equal(sitesForCompany("madison").some((site) => /coker pad/i.test(site.name)), false);
    assert.equal(sitesForCompany("cbi").length, 0);
    assert.equal(matchCatalogSite("Madison CAT 2 Wood River — Roxana, IL")?.id, "site-madison");
    assert.equal(matchCatalogSite("Coker drum valve package — T&M")?.id, "site-madison");
    assert.equal(jobTreeClientId("Phillips 66", "Wood River — Roxana, IL"), PHILLIPS_66_CLIENT_ID);
    assert.equal(jobTreeClientId("Georgia Power", "Yates"), GEORGIA_POWER_CLIENT_ID);
    assert.equal(jobTreeClientId("Phillips 66", "Yates"), GEORGIA_POWER_CLIENT_ID);
    assert.equal(jobTreeClientId("P66", "Bowen"), GEORGIA_POWER_CLIENT_ID);
    assert.equal(jobTreeClientId("Scherer"), GEORGIA_POWER_CLIENT_ID);
    assert.equal(clientIdForSite({ id: "site-yates", client: "Phillips 66", name: "Yates" }), GEORGIA_POWER_CLIENT_ID);
    assert.equal(clientIdForSite({ client: "Georgia Power", name: "Yates", family: "Georgia Power" }), GEORGIA_POWER_CLIENT_ID);
    assert.equal(clientIdForSite({ id: "site-ferndale", client: "Phillips 66", name: "Ferndale", family: "Phillips 66" }), PHILLIPS_66_CLIENT_ID);
    assert.deepEqual(JOB_TREE_CLIENT_SITE_IDS[PHILLIPS_66_CLIENT_ID], [
      "site-madison",
      "site-rodeo",
      "site-bayway",
      "site-ferndale",
      "site-billings",
    ]);
    assert.deepEqual(JOB_TREE_CLIENT_SITE_IDS[GEORGIA_POWER_CLIENT_ID], ["site-yates"]);
    assert.equal(JOB_TREE_CLIENT_SITE_IDS[PHILLIPS_66_CLIENT_ID].includes("site-yates"), false);
    assert.equal(matchCatalogSite("Rodeo U110 2026 TA")?.id, "site-rodeo");
    assert.equal(matchCatalogSite("U250 Fall 2026")?.id, "site-rodeo");
    assert.equal(matchCatalogSite("Monroe 541V POST REVIEW")?.id, "site-monroe");
    assert.equal(matchCatalogSite("Boiler 17 2026")?.id, "site-madison");
    assert.equal(matchCatalogSite("EST-B1726 b1726")?.id, "site-madison");
  });

  it("places Locked Boiler 17 under Phillips 66 → Wood River", () => {
    const jobs = jobsOnDesk([], [boiler17], false, owner, undefined, { includeSeeds: false });
    const tree = jobTree({ scope: owner, jobs, packs: [boiler17] });
    const madison = tree.find((row) => row.id === "madison");
    const p66 = madison?.clients.find((client) => client.id === PHILLIPS_66_CLIENT_ID);
    const wood = p66?.sites.find((site) => site.id === "site-madison");
    const job = wood?.jobs.find((row) => row.id === `job-${BOILER17_PACK_ID}`);
    assert.equal(job?.title, BOILER17_TITLE);
    assert.equal(job?.workingFigure, "JN 108451 · Locked");
    assert.equal(jobEstimateHref(job, [], [boiler17]), `/estimates/${BOILER17_PACK_ID}`);
    assert.equal(p66?.name, "Phillips 66");
    assert.equal(wood?.name.includes("Wood River") || wood?.name.includes("Madison"), true);
  });

  it("lets the owner see every company and testers only the one they are on", () => {
    const ownerTree = jobTree({ scope: owner, jobs: jobsOnDesk([], [cat2], false, owner), packs: [cat2] });
    assert.deepEqual(
      ownerTree.map((row) => row.id),
      ["hitsquad", "madison", "cbi", LUCKY13_ID],
    );
    const madison = ownerTree.find((row) => row.id === "madison");
    const p66 = madison?.clients.find((client) => client.id === PHILLIPS_66_CLIENT_ID);
    const georgia = madison?.clients.find((client) => client.id === GEORGIA_POWER_CLIENT_ID);
    const wood = madison?.sites.find((site) => site.id === "site-madison");
    assert.equal(wood?.assigned, true);
    assert.equal(wood?.jobs.some((job) => job.id === "job-new-mtaajdwa-f7539"), true);
    assert.equal(p66?.name, "Phillips 66");
    assert.equal(p66?.sites.some((site) => site.id === "site-madison" && site.assigned), true);
    assert.equal(p66?.sites.some((site) => site.id === "site-rodeo" && site.name === "Rodeo" && !site.jobs.length), true);
    assert.equal(p66?.sites.some((site) => site.id === "site-bayway" && site.name === "Bayway"), true);
    assert.equal(p66?.sites.some((site) => site.id === "site-ferndale" && site.name === "Ferndale"), true);
    assert.equal(p66?.sites.some((site) => site.name === "Not assigned"), false);
    assert.equal(georgia?.name, "Georgia Power");
    assert.equal(georgia?.sites.some((site) => site.id === "site-yates" && site.name === "Yates" && !site.jobs.length), true);
    assert.equal(madison?.sites.some((site) => site.id === "site-yates" && !site.assigned && !site.jobs.length), true);
    assert.equal(madison?.sites.some((site) => site.id === "site-monroe" && site.name === "Monroe Energy" && !site.jobs.length), true);
    assert.equal(madison?.sites.some((site) => /coker pad/i.test(site.name)), false);
    assert.equal(madison?.sites.some((site) => site.name === "Not assigned"), false);
    assert.equal(ownerTree.find((row) => row.id === LUCKY13_ID)?.sites.some((site) => site.id === UNASSIGNED_SITE_ID), false);
    assert.equal(ownerTree.find((row) => row.id === LUCKY13_ID)?.clients.length, 0);

    const nathanJobs = jobsOnDesk([], [cat2], true, nathan);
    const nathanTree = jobTree({ scope: nathan, jobs: nathanJobs, packs: [cat2] });
    assert.deepEqual(nathanTree.map((row) => row.id), ["madison"]);
    assert.equal(nathanTree[0]?.sites.some((site) => site.id === "site-madison" && site.jobs.some((job) => job.title.includes("CAT 2"))), true);
    assert.equal(nathanTree[0]?.sites.some((site) => site.id === "site-madison" && site.assigned), true);
    assert.deepEqual(nathanTree[0]?.clients.map((client) => client.id), [PHILLIPS_66_CLIENT_ID]);
    assert.equal(nathanTree[0]?.clients.some((client) => client.id === GEORGIA_POWER_CLIENT_ID), false);
    assert.equal(
      nathanTree[0]?.sites.some((site) =>
        /yates|rodeo|bayway|ferndale|billings|coker pad/i.test(site.name) && !site.jobs.length,
      ),
      false,
    );
    assert.equal(nathanTree[0]?.sites.some((site) => !site.jobs.length), false);
    assert.deepEqual(assignedSiteIds({ scope: nathan, jobs: nathanJobs, packs: [cat2], companyId: "madison" }), [
      "site-madison",
    ]);
    assert.equal(nathanTree.some((row) => row.id === "cbi"), false);

    const beechTree = jobTree({ scope: johnBeech, jobs: jobsOnDesk([], [], true, johnBeech), packs: [] });
    assert.deepEqual(beechTree.map((row) => row.id), ["madison"]);
    assert.equal(beechTree[0]?.sites.some((site) => !site.jobs.length), false);

    const jamesJobs = jobsOnDesk([], dummyPacksForUser(james), false, james);
    const jamesTree = jobTree({ scope: james, jobs: jamesJobs, packs: dummyPacksForUser(james) });
    assert.deepEqual(jamesTree.map((row) => row.id), ["cbi"]);
    assert.equal(jamesTree[0]?.sites.some((site) => site.jobs.some((job) => job.title === "Shop sketch")), true);
    assert.equal(jamesTree.some((row) => row.id === "madison"), false);
    assert.equal(jamesTree[0]?.sites.some((site) => /yates|wood river/i.test(site.name)), false);

    const josephTree = jobTree({
      scope: joseph,
      jobs: jobsOnDesk([], [], false, joseph, undefined, { includeSeeds: seedJobsAllowed(joseph) }),
      packs: [],
    });
    assert.deepEqual(josephTree.map((row) => row.id), ["hitsquad"]);
    assert.equal(josephTree[0]?.sites.some((site) => /yates|wood river/i.test(site.name) && site.id !== UNASSIGNED_SITE_ID), false);
    assert.equal(josephTree[0]?.sites.some((site) => !site.jobs.length), false);

    const henryTree = jobTree({
      scope: johnHenry,
      jobs: jobsOnDesk([], [], false, johnHenry, undefined, { includeSeeds: seedJobsAllowed(johnHenry) }),
      packs: [],
    });
    assert.deepEqual(henryTree.map((row) => row.id), [LUCKY13_ID]);
    assert.equal(henryTree[0]?.sites.every((site) => site.jobs.length > 0), true);
    assert.equal(henryTree[0]?.sites.some((site) => !site.jobs.length), false);
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
    const wake = rodeoMonroeWakeCards().find((row) => row.packId === RODEO_U110_PACK_ID)!;
    const wakeJob = jobsOnDesk([], [wake], false, owner).find((row) => row.id === `job-${RODEO_U110_PACK_ID}`);
    assert.ok(wakeJob);
    assert.equal(jobEstimateHref(wakeJob, [], [wake]), "/jobs/rodeo?job=EST-U11026");
    assert.equal(jobEstimateHref(wakeJob, [], [{ packId: RODEO_U110_PACK_ID }]), "/jobs/rodeo?job=EST-U11026");
  });

  it("keeps a James Wood River sample under CBI on the owner tree", () => {
    const sample = {
      packId: "new-mtkigb-james",
      key: "new:new-mtkigb-james",
      title: "New Turnaround estimate",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 1,
      ownerEmail: JAMES_EMAIL,
    };
    const jobs = jobsOnDesk([], [sample], false, owner, undefined, { includeSeeds: false });
    const tree = jobTree({ scope: owner, jobs, packs: [sample] });
    const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
    const cbi = tree.find((row) => row.id === "cbi");
    assert.equal(companyIdForJob(jobs[0]!, owner, sample), "cbi");
    assert.equal(wood?.jobs.some((job) => job.title === "New Turnaround estimate"), false);
    assert.equal(cbi?.sites.some((site) => site.jobs.some((job) => job.title === "New Turnaround estimate")), true);
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

  it("lets every company collapse and stays all-collapsed (empty string is not Madison)", () => {
    const companies = COMPANIES.map((row) => ({ id: row.id }));
    assert.equal(resolveOpenCompanyId(undefined, companies), "madison");
    assert.equal(resolveOpenCompanyId("", companies), "");
    assert.equal(resolveOpenCompanyId("hitsquad", companies), "hitsquad");
    assert.equal(stickyOpenCompanyId(null, companies), "madison");
    assert.equal(stickyOpenCompanyId("", companies), "");
    assert.equal(stickyOpenCompanyId("hitsquad", companies), "hitsquad");
    assert.equal(stickyOpenCompanyId("gone", companies), "madison");

    assert.equal(toggleOpenCompanyId(null, "madison", companies), "");
    assert.equal(toggleOpenCompanyId("madison", "madison", companies), "");
    assert.equal(toggleOpenCompanyId("", "madison", companies), "madison");
    assert.equal(toggleOpenCompanyId("madison", "hitsquad", companies), "hitsquad");
    assert.equal(toggleOpenCompanyId("hitsquad", "hitsquad", companies), "");

    const collapsed = toggleOpenCompanyId("madison", "madison", companies);
    assert.equal(stickyOpenCompanyId(collapsed, companies), "");
    assert.equal(resolveOpenCompanyId(collapsed, companies), "");
    const openedHitsquad = toggleOpenCompanyId(collapsed, "hitsquad", companies);
    assert.equal(openedHitsquad, "hitsquad");
    assert.equal(openedHitsquad === "madison", false);
    assert.equal(toggleOpenCompanyId(openedHitsquad, "hitsquad", companies), "");

    const desk = readFileSync(fileURLToPath(new URL("../components/JobsDesk.tsx", import.meta.url)), "utf8");
    const treeDesk = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    const rates = readFileSync(fileURLToPath(new URL("../components/RatesDesk.tsx", import.meta.url)), "utf8");
    assert.match(treeDesk, /resolveOpenCompanyId\(openCompanyId, tree\)/);
    assert.equal(/openCompanyId \|\| defaultOpenCompanyId/.test(treeDesk), false);
    assert.match(treeDesk, /\{open \? "▴" : "▾"\}/);
    assert.match(treeDesk, /inline-flex h-9 w-9 shrink-0 items-center justify-center/);
    assert.match(treeDesk, /text-xl leading-none/);
    assert.match(treeDesk, /border-\[#3ec6d4\]\/70 bg-\[#0F5F6D\]\/55/);
    assert.match(treeDesk, /text-paper-cream/);
    assert.match(treeDesk, /border-\[#0F5F6D\]\/40 bg-white\/80/);
    assert.match(treeDesk, /text-\[#0F5F6D\]/);
    assert.equal(/font-mono text-\[11px\] tracking-\[0\.2em\] text-amber-label/.test(treeDesk), false);
    assert.match(treeDesk, /aria-label=\{open \? "Collapse" : "Expand"\}/);
    assert.match(treeDesk, /company\.id === openId/);
    assert.match(desk, /stickyOpenCompanyId\(openCompanyId, tree\)/);
    assert.match(desk, /toggleOpenCompanyId\(current, id, tree\)/);
    assert.match(rates, /writeRateCompanyOpen/);
    assert.equal(/resolveOpenCompanyId|stickyOpenCompanyId/.test(rates), false);
  });

  it("collapses sites with 2+ jobs and stays collapsed (missing key is expanded)", () => {
    const one = { id: "site-one", jobs: [{ id: "a" }] };
    const two = { id: "site-two", jobs: [{ id: "a" }, { id: "b" }] };
    const empty = { id: "site-empty", jobs: [] };
    assert.equal(siteIsCollapsible(one), false);
    assert.equal(siteIsCollapsible(empty), false);
    assert.equal(siteIsCollapsible(two), true);
    assert.equal(siteTreeKey("madison", "site-madison"), "madison:site-madison");

    const start = new Set<string>();
    assert.equal(resolveSiteOpen(start, "madison", two), true);
    assert.equal(resolveSiteOpen(start, "madison", one), true);
    const collapsed = toggleCollapsedSite(start, "madison", two);
    assert.equal(resolveSiteOpen(collapsed, "madison", two), false);
    assert.equal(resolveSiteOpen(collapsed, "madison", one), true);
    assert.equal(resolveSiteOpen(toggleCollapsedSite(collapsed, "madison", one), "madison", two), false);
    assert.equal(resolveSiteOpen(toggleCollapsedSite(collapsed, "madison", two), "madison", two), true);

    const treeDesk = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    assert.match(treeDesk, /resolveSiteOpen\(collapsedSites, company\.id, site\)/);
    assert.match(treeDesk, /toggleCollapsedSite\(prev, company\.id, site\)/);
    assert.match(treeDesk, /aria-label=\{siteOpen \? "Collapse" : "Expand"\}/);
    assert.match(treeDesk, /<CollapseChip open=\{siteOpen\} night=\{night\} \/>/);
    assert.match(treeDesk, /siteIsCollapsible\(site\)/);
    assert.equal(/openSites\[key\] \|\| true/.test(treeDesk), false);
    assert.match(treeDesk, /useState<Set<string>>/);
  });

  it("groups Madison plants under Phillips 66 and Georgia Power, not Not assigned", () => {
    const ownerTree = jobTree({ scope: owner, jobs: jobsOnDesk([], [cat2], false, owner), packs: [cat2] });
    const madison = ownerTree.find((row) => row.id === "madison");
    const p66 = madison?.clients.find((client) => client.id === PHILLIPS_66_CLIENT_ID);
    const georgia = madison?.clients.find((client) => client.id === GEORGIA_POWER_CLIENT_ID);
    assert.ok(p66);
    assert.ok(georgia);
    assert.deepEqual(
      madison?.clients.map((client) => client.id).slice(0, 2),
      [PHILLIPS_66_CLIENT_ID, GEORGIA_POWER_CLIENT_ID],
    );
    for (const name of ["Wood River", "Rodeo", "Bayway", "Ferndale", "Billings"]) {
      assert.equal(p66?.sites.some((site) => site.name === name), true, name);
    }
    assert.equal(p66?.sites.some((site) => site.name === "Yates"), false);
    assert.equal(georgia?.sites.some((site) => site.name === "Yates"), true);
    assert.equal(georgia?.sites.some((site) => /bowen|scherer/i.test(site.name)), false);
    assert.equal(p66?.sites.find((site) => site.id === "site-ferndale")?.name, "Ferndale");
    assert.equal("note" in (p66?.sites.find((site) => site.id === "site-ferndale") || {}), false);
    assert.equal(
      madison?.clients.some((client) => client.sites.some((site) => site.name === "Not assigned")),
      false,
    );

    const desk = readFileSync(fileURLToPath(new URL("../components/JobsDesk.tsx", import.meta.url)), "utf8");
    const treeDesk = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    const plantPage = readFileSync(fileURLToPath(new URL("../components/JobPlantPage.tsx", import.meta.url)), "utf8");
    assert.match(desk, /Client, then site, then the job/);
    assert.match(treeDesk, /company\.clients\.map/);
    assert.equal(/site\.note/.test(treeDesk), false);
    assert.equal(/GEP|TASO|Competitive bid|Regular|Unick|per diem|Work Folder|B-1/i.test(treeDesk), false);
    assert.equal(/GEP|TASO|Competitive bid|Unick|per diem|Work Folder|B-1/i.test(desk), false);
    assert.equal(/Unick|GEP|TASO|Competitive bid|per diem|Work Folder|B-1/i.test(plantPage), false);
    assert.equal(/Not assigned/.test(treeDesk), false);
    assert.equal(/site\.assigned \? alias\(site\.name\) : "Not assigned"/.test(treeDesk), false);
  });

  it("collapses clients independently and starts empty Georgia Power closed", () => {
    const empty = { id: GEORGIA_POWER_CLIENT_ID, sites: [{ id: "site-yates", jobs: [] }] };
    const busy = {
      id: PHILLIPS_66_CLIENT_ID,
      sites: [{ id: "site-madison", jobs: [{ id: "a" }, { id: "b" }] }],
    };
    assert.equal(clientTreeKey("madison", PHILLIPS_66_CLIENT_ID), "madison:client:phillips-66");
    const start = new Set<string>();
    assert.equal(resolveClientOpen(start, "madison", busy), true);
    assert.equal(resolveClientOpen(start, "madison", empty), false);
    const opened = toggleCollapsedClient(start, "madison", empty);
    assert.equal(resolveClientOpen(opened, "madison", empty), true);
    const closed = toggleCollapsedClient(opened, "madison", empty);
    assert.equal(resolveClientOpen(closed, "madison", empty), false);
    const hidP66 = toggleCollapsedClient(start, "madison", busy);
    assert.equal(resolveClientOpen(hidP66, "madison", busy), false);
    assert.equal(resolveClientOpen(toggleCollapsedClient(hidP66, "madison", busy), "madison", busy), true);

    const ownerTree = jobTree({ scope: owner, jobs: jobsOnDesk([], [cat2], false, owner), packs: [cat2] });
    const defaults = defaultCollapsedClientKeys(ownerTree);
    assert.equal(defaults.has(clientTreeKey("madison", GEORGIA_POWER_CLIENT_ID)), true);
    assert.equal(defaults.has(clientTreeKey("madison", PHILLIPS_66_CLIENT_ID)), false);

    const treeDesk = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    assert.match(treeDesk, /resolveClientOpen\(collapsedClients, company\.id, client\)/);
    assert.match(treeDesk, /toggleCollapsedClient\(prev, company\.id, client\)/);
    assert.match(treeDesk, /<CollapseChip open=\{clientOpen\} night=\{night\} \/>/);
    assert.match(treeDesk, /clientIsCollapsible\(\)/);
  });

  it("keeps James on CBI client work without Madison P66 or Georgia Power", () => {
    const jamesJobs = jobsOnDesk([], dummyPacksForUser(james), false, james);
    const jamesTree = jobTree({ scope: james, jobs: jamesJobs, packs: dummyPacksForUser(james) });
    assert.deepEqual(jamesTree.map((row) => row.id), ["cbi"]);
    assert.equal(jamesTree[0]?.clients.some((client) => client.id === PHILLIPS_66_CLIENT_ID), false);
    assert.equal(jamesTree[0]?.clients.some((client) => client.id === GEORGIA_POWER_CLIENT_ID), false);
    assert.equal(jamesTree[0]?.clients.some((client) => client.sites.some((site) => site.jobs.some((job) => job.title === "Shop sketch"))), true);
  });
});
