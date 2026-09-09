import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BOILER17_PACK_ID, BOILER17_TITLE } from "./boiler-17.ts";
import { companiesForScope, companyIdForUser, companyScopeFor, canSeeCompany } from "./companies.ts";
import { isMadisonOperatedPack, listedDeskPacks, localPackVisibleTo, packListedOnOwnerDesk } from "./estimate-scope.ts";
import { shouldPaintHisCards, HIS_AROMATICS_PACK_ID, HIS_CAT2_PACK_ID } from "./his-wood-river.ts";
import { jobsOnDesk, seedJobsAllowed } from "./jobs.ts";
import { companyIdForJob, jobTree, PHILLIPS_66_CLIENT_ID } from "./job-tree.ts";
import { packsForViewedDesk } from "./lens-packs.ts";
import { qualityHseJobTree } from "./quality-hse-scope.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  MONROE_541V_PACK_ID,
  RODEO_U110_PACK_ID,
  RODEO_U250_PACK_ID,
  shouldPaintWakeCards,
} from "./rodeo-monroe-wake.ts";
import { JOBS_REFRESH_DEADLINE_MS } from "./session-fetch.ts";
import { TESTER_SEATS } from "./tester-seats.ts";
import type { LocalPack, StorageLike } from "./local-estimates.ts";

const president = {
  id: "custom-freddy",
  email: "president.example@example.com",
  name: "Freddy Grimland",
  role: "president" as const,
};

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };

function memoryStore(): StorageLike {
  const data: Record<string, string> = {};
  return {
    getItem(key) {
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("President Jobs company root and Madison book", () => {
  it("does not invent Freddy in TESTER_SEATS", () => {
    assert.equal(
      TESTER_SEATS.some((row) => /freddy/i.test(row.email) || /freddy/i.test(row.name)),
      false,
    );
  });

  it("scopes President to Madison even when leftover assignment says Hit Squad", () => {
    assert.equal(companyIdForUser(president, "hitsquad"), "madison");
    const scope = companyScopeFor(president, "hitsquad");
    assert.equal(scope?.companyId, "madison");
    assert.equal(scope?.role, "president");
    assert.equal(scope?.isOwner, false);
    assert.deepEqual(
      companiesForScope(scope).map((row) => row.id),
      ["madison"],
    );
    assert.equal(canSeeCompany(scope, "madison"), true);
    assert.equal(canSeeCompany(scope, "hitsquad"), false);
    assert.equal(seedJobsAllowed(scope), false);
    assert.equal(shouldPaintHisCards(president), true);
    assert.equal(shouldPaintWakeCards(president, scope), true);
  });

  it("lists Madison-operated packs for President without granting Hit Squad product work", () => {
    const cat2 = {
      packId: HIS_CAT2_PACK_ID,
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      ownerEmail: "nathanboyte@gmail.com",
    };
    const hitsquadOnly = {
      packId: "new-hs-internal",
      title: "Owner hallway sketch",
      client: "Hit Squad",
      site: "",
      ownerEmail: OWNER_LOGIN_EMAIL,
    };
    assert.equal(isMadisonOperatedPack(cat2), true);
    assert.equal(isMadisonOperatedPack(hitsquadOnly), false);
    assert.equal(localPackVisibleTo(president, cat2), true);
    assert.equal(packListedOnOwnerDesk(president, cat2), true);
    assert.equal(localPackVisibleTo(president, hitsquadOnly), false);
    assert.equal(packListedOnOwnerDesk(president, hitsquadOnly), false);
    assert.deepEqual(
      listedDeskPacks(president, [cat2, hitsquadOnly]).map((row) => row.packId),
      [HIS_CAT2_PACK_ID],
    );
  });

  it("View-as-President Jobs tree roots on Madison and keeps the Madison job book", () => {
    const scope = companyScopeFor(president);
    const store = memoryStore();
    const packs = packsForViewedDesk(president, true, president.id, store);
    const jobs = jobsOnDesk([], packs, true, scope, undefined, { seat: president.id });
    const tree = jobTree({ scope, jobs, packs });

    assert.deepEqual(tree.map((row) => row.id), ["madison"]);
    assert.equal(tree.some((row) => row.id === "hitsquad"), false);
    const madison = tree[0];
    assert.equal(madison?.name, "Madison");
    const p66 = madison?.clients.find((client) => client.id === PHILLIPS_66_CLIENT_ID);
    const wood = p66?.sites.find((site) => site.id === "site-madison");
    const rodeo = p66?.sites.find((site) => site.id === "site-rodeo");
    const titles = (madison?.sites ?? []).flatMap((site) => site.jobs.map((job) => job.title));
    assert.equal(titles.some((title) => title.includes("Aromatics")), true);
    assert.equal(titles.some((title) => title.includes("CAT 2")), true);
    assert.equal(titles.some((title) => title === BOILER17_TITLE || title.includes("Boiler 17")), true);
    assert.equal(titles.some((title) => title.includes("U110")), true);
    assert.equal(titles.some((title) => title.includes("U250")), true);
    assert.equal(titles.some((title) => title.includes("541V") || title.includes("Monroe")), true);
    assert.ok(wood?.jobs.some((job) => job.id === `job-${HIS_AROMATICS_PACK_ID}`));
    assert.ok(wood?.jobs.some((job) => job.id === `job-${HIS_CAT2_PACK_ID}`));
    assert.ok(wood?.jobs.some((job) => job.id === `job-${BOILER17_PACK_ID}`));
    assert.ok(rodeo?.jobs.some((job) => job.id === `job-${RODEO_U110_PACK_ID}`));
    assert.ok(rodeo?.jobs.some((job) => job.id === `job-${RODEO_U250_PACK_ID}`));
    assert.ok(madison?.sites.some((site) => site.jobs.some((job) => job.id === `job-${MONROE_541V_PACK_ID}`)));
    const quality = qualityHseJobTree({
      scope,
      packs,
      viewingAs: true,
      seat: president.id,
    });
    assert.deepEqual(quality.map((row) => row.id), ["madison"]);
    assert.equal(quality[0]?.sites.some((site) => site.jobs.some((job) => job.title.includes("CAT 2"))), true);
  });

  it("does not park a Hit Squad-only estimate on the President Madison root", () => {
    const scope = companyScopeFor(president);
    const hallway: LocalPack = {
      packId: "new-hs-internal",
      key: "new:new-hs-internal",
      title: "Owner hallway sketch",
      client: "Hit Squad",
      site: "",
      createdAt: 2,
      updatedAt: 2,
      ownerEmail: OWNER_LOGIN_EMAIL,
    };
    const fromDesk = jobsOnDesk([], [hallway], true, scope, undefined, { seat: president.id });
    const placed = fromDesk.find((row) => row.id === "job-new-hs-internal") ?? {
      id: "job-new-hs-internal",
      ownerId: "owner",
      code: "HS-INT",
      title: hallway.title,
      client: hallway.client,
      discipline: "mechanical",
      kind: "estimate" as const,
      status: "OPEN" as const,
      window: "",
      workingFigure: "",
      hseNote: "",
    };
    assert.equal(companyIdForJob(placed, scope, hallway), "hitsquad");
    const tree = jobTree({ scope, jobs: [placed], packs: [hallway] });
    assert.deepEqual(tree.map((row) => row.id), ["madison"]);
    assert.equal(
      tree[0]?.sites.some((site) => site.jobs.some((row) => row.id === placed.id)),
      false,
    );
  });

  it("keeps the owner Jobs picture on Hit Squad and Madison", () => {
    const ownerScope = companyScopeFor(owner, "hitsquad");
    const store = memoryStore();
    const packs = packsForViewedDesk(owner, false, null, store);
    const jobs = jobsOnDesk([], packs, false, ownerScope, undefined, { includeSeeds: false });
    const tree = jobTree({ scope: ownerScope, jobs, packs });
    assert.deepEqual(
      tree.map((row) => row.id),
      ["hitsquad", "madison"],
    );
    assert.equal(tree.some((row) => row.id === "madison" && row.sites.some((site) => site.jobs.length > 0)), true);
  });
});

describe("Jobs REFRESHING overlay always clears", () => {
  it("uses a soft timeout and finally-clear, and does not resubscribe on lens identity", () => {
    assert.ok(JOBS_REFRESH_DEADLINE_MS <= 8000);
    const desk = source("../components/JobsDesk.tsx");
    assert.match(desk, /JOBS_REFRESH_DEADLINE_MS/);
    assert.match(desk, /setTimeout\(/);
    assert.match(desk, /finally \{\s*clearHold\(\);/);
    assert.match(desk, /if \(!lensReady\) \{\s*setHydrating\(false\);/);
    assert.match(desk, /\[lensKey, lensReady, seat, tick, viewingAs\]/);
    assert.doesNotMatch(desk, /viewingAs, lens\]/);
    assert.match(desk, /REFRESHING JOBS/);
  });
});
