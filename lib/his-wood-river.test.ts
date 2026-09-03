import test from "node:test";
import assert from "node:assert/strict";
import { localPackToJob, rememberLocalPack } from "./local-estimates.ts";
import { localPackVisibleTo } from "./estimate-scope.ts";
import {
  LENS_PACKS_LEGACY_KEY,
  OWNER_PACKS_KEY,
  OWNER_PACKS_LEGACY_KEY,
  bustHisLeftoverOnce,
  packsForViewedDesk,
  readOwnerPacks,
  writeLensPacks,
  writeOwnerPacks,
} from "./lens-packs.ts";
import { jobsOnDesk } from "./jobs.ts";
import type { StorageLike } from "./local-estimates.ts";
import { companyScopeFor } from "./companies.ts";
import { handoffMarkText } from "./handoff.ts";
import { jobTree } from "./job-tree.ts";
import { JAMES_EMAIL } from "./tester-seats.ts";
import {
  HIS_AROMATICS_FILE_ID,
  HIS_AROMATICS_PACK_ID,
  HIS_AROMATICS_STUB_ID,
  HIS_CAT2_FILE_ID,
  HIS_CAT2_PACK_ID,
  HIS_TM_FILE_ID,
  HIS_TM_PACK_ID,
  NATHAN_DESK_EMAIL,
  applyHisIdentity,
  hisFileForPackId,
  hisKnownEstimateFiles,
  hisMatchForPack,
  hisWoodRiverCards,
  jobCodeFromPackId,
  mergeHisWoodRiverCards,
  HIS_LEFTOVER_GEN,
  HIS_LEFTOVER_GEN_KEY,
  isStaleHisLeftoverIdentity,
  leftoverGenIsCurrent,
  leftoverHasStaleHisIdentity,
  persistHisWoodRiverCards,
  shouldPaintHisCards,
} from "./his-wood-river.ts";

const owner = { email: "robertmhenderson582@gmail.com", role: "owner" as const };

function memoryStore(seed: Record<string, string> = {}): StorageLike {
  const data = { ...seed };
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

test("HIS known files include Aromatics + CAT + T&M by file id, never the thin stub", () => {
  const ids = hisKnownEstimateFiles().map((row) => row.fileId);
  assert.ok(ids.includes(HIS_AROMATICS_FILE_ID));
  assert.ok(ids.includes(HIS_CAT2_FILE_ID));
  assert.ok(ids.includes(HIS_TM_FILE_ID));
  assert.ok(!ids.includes(HIS_AROMATICS_STUB_ID));
  assert.equal(hisFileForPackId(HIS_AROMATICS_PACK_ID)?.fileId, HIS_AROMATICS_FILE_ID);
  assert.equal(hisFileForPackId(HIS_CAT2_PACK_ID)?.fileId, HIS_CAT2_FILE_ID);
  assert.equal(hisFileForPackId(HIS_TM_PACK_ID)?.fileId, HIS_TM_FILE_ID);
  assert.equal(hisFileForPackId("new-mtj5d6-longer-vault")?.fileId, HIS_TM_FILE_ID);
  assert.equal(hisFileForPackId("new-mtj5d6-tm2027")?.fileId, HIS_TM_FILE_ID);
});

test("HIS cards stay on Nathan's desk and paint EST-MTJ5D6 without extra share rows", () => {
  const cards = hisWoodRiverCards();
  assert.deepEqual(
    cards.map((row) => row.packId).sort(),
    [HIS_AROMATICS_PACK_ID, HIS_CAT2_PACK_ID, HIS_TM_PACK_ID].sort(),
  );
  for (const card of cards) {
    assert.equal(card.ownerEmail, NATHAN_DESK_EMAIL);
    assert.equal(card.sharedWith, undefined);
  }
  assert.equal(localPackToJob(cards.find((row) => row.packId === HIS_TM_PACK_ID)!).code, "EST-MTJ5D6");
});

test("owner first paint with empty local still shows Aromatics, CAT, and T&M", () => {
  const store = memoryStore();
  const cards = hisWoodRiverCards();
  assert.ok(cards.every((card) => localPackVisibleTo(owner, card)));
  const desk = packsForViewedDesk(owner, false, null, store);
  const titles = desk.map((row) => row.title);
  assert.ok(titles.includes("2027 Aromatics Turnaround"));
  assert.ok(titles.includes("Madison CAT 2 (Pit Stop)"));
  assert.ok(titles.includes("Wood River / T&M 2027-01 to 06"));
  const jobs = jobsOnDesk(undefined, desk, false);
  assert.ok(jobs.some((job) => job.title === "2027 Aromatics Turnaround"));
  assert.ok(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"));
  assert.ok(jobs.some((job) => job.code === "EST-MTJ5D6"));
});

test("empty leftover cannot drop HIS cards already on the desk", () => {
  const existing = hisWoodRiverCards();
  const merged = mergeHisWoodRiverCards(existing);
  assert.ok(merged.some((row) => row.packId === HIS_AROMATICS_PACK_ID));
  assert.ok(merged.some((row) => row.packId === HIS_CAT2_PACK_ID));
  assert.ok(merged.some((row) => row.packId === HIS_TM_PACK_ID));
  assert.equal(merged.filter((row) => row.title === "2027 Aromatics Turnaround").length, 1);
});

test("James sample on Wood River does not steal Nathan T&M or hide Aromatics and CAT", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      packId: "new-mtkigb-james",
      title: "New Turnaround estimate",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      ownerEmail: JAMES_EMAIL,
    },
    store,
  );
  rememberLocalPack(
    {
      packId: HIS_TM_PACK_ID,
      title: "Wood River / T&M 2027-01 to 06",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      ownerEmail: JAMES_EMAIL,
    },
    store,
  );
  writeLensPacks(
    "james",
    [
      {
        packId: "new-mtkigb-james",
        key: "new:new-mtkigb-james",
        title: "New Turnaround estimate",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 20,
        updatedAt: 21,
        ownerEmail: JAMES_EMAIL,
      },
    ],
    store,
  );

  const painted = packsForViewedDesk(owner, false, null, store);
  const tm = painted.find((row) => row.title === "Wood River / T&M 2027-01 to 06");
  const jamesSample = painted.find((row) => row.packId === "new-mtkigb-james");
  assert.equal(hisMatchForPack(jamesSample), null);
  assert.equal(localPackToJob(jamesSample!).code, "EST-MTKIGB");
  assert.equal(tm?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.deepEqual(tm?.sharedWith ?? [], []);
  assert.equal(handoffMarkText(tm!, owner.email), "Nathan Boyte's desk.");
  assert.equal(handoffMarkText(jamesSample!, owner.email), "James Cain's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(painted.filter((row) => row.title === "Wood River / T&M 2027-01 to 06").length, 1);
  assert.equal(applyHisIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: JAMES_EMAIL }).ownerEmail, NATHAN_DESK_EMAIL);

  const jobs = jobsOnDesk(undefined, painted, false, companyScopeFor(owner), undefined, { includeSeeds: false });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: painted });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const cbi = tree.find((row) => row.id === "cbi");
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTJ5D6"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "New Turnaround estimate"), false);
  assert.equal(cbi?.sites.some((site) => site.jobs.some((job) => job.title === "New Turnaround estimate")), true);
});

test("vault T&M with a longer packId replaces the paint card instead of duplicating", () => {
  const vault = {
    packId: "new-mtj5d6-from-vault",
    key: "new:new-mtj5d6-from-vault",
    title: "Wood River / T&M 2027-01 to 06",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 9,
    updatedAt: 10,
    ownerEmail: NATHAN_DESK_EMAIL,
    sharedWith: ["robertmhenderson582@gmail.com"],
  };
  const merged = mergeHisWoodRiverCards([vault]);
  assert.equal(merged.filter((row) => row.title === vault.title).length, 1);
  assert.equal(merged.find((row) => row.title === vault.title)?.packId, vault.packId);
  assert.ok(merged.some((row) => row.packId === HIS_AROMATICS_PACK_ID));
  assert.ok(merged.some((row) => row.packId === HIS_CAT2_PACK_ID));
});

test("live leftover T&M matches without an exact new-mtj5d6 packId or a site", () => {
  assert.equal(jobCodeFromPackId("new-MTJ5D6"), "EST-MTJ5D6");
  assert.equal(jobCodeFromPackId("new-MTJ5D6-live"), "EST-MTJ5D6");
  assert.equal(hisFileForPackId("new-MTJ5D6")?.fileId, HIS_TM_FILE_ID);
  assert.equal(hisFileForPackId("new-MTJ5D6-live")?.fileId, HIS_TM_FILE_ID);
  assert.equal(hisMatchForPack({ packId: "new-MTJ5D6-live", ownerEmail: JAMES_EMAIL })?.fileId, HIS_TM_FILE_ID);
  assert.equal(
    hisMatchForPack({ packId: "new-other", title: "Wood River / T&M 2027-01 to 06", ownerEmail: JAMES_EMAIL })?.fileId,
    HIS_TM_FILE_ID,
  );
  assert.equal(hisMatchForPack({ packId: "new-mtkigb-james", title: "New Turnaround estimate", ownerEmail: JAMES_EMAIL }), null);
  assert.equal(shouldPaintHisCards({ email: "Robert Henderson" }), true);
  assert.equal(shouldPaintHisCards({ email: owner.email }), true);
});

test("leftover T&M occupying the slot still keeps Aromatics and CAT on Nathan's desk", () => {
  const leftover = {
    packId: "new-MTJ5D6-live",
    key: "new:new-MTJ5D6-live",
    title: "Wood River / T&M 2027-01 to 06",
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 5,
    ownerEmail: JAMES_EMAIL,
    transferredToName: "James Cain",
    estimator: "James Cain",
  };
  const painted = mergeHisWoodRiverCards([leftover]);
  const tm = painted.find((row) => row.title === leftover.title);
  assert.equal(painted.filter((row) => row.title === leftover.title).length, 1);
  assert.equal(tm?.packId, leftover.packId);
  assert.equal(tm?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(tm?.transferredToName, undefined);
  assert.equal(handoffMarkText(tm!, owner.email), "Nathan Boyte's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(applyHisIdentity(leftover).ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(applyHisIdentity({ ...leftover, ownerEmail: JAMES_EMAIL }), owner.email), "Nathan Boyte's desk.");
});

test("after leftover hydrate, persisted HIS extras still name Nathan's desk", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      packId: "new-MTJ5D6-live",
      title: "Wood River / T&M 2027-01 to 06",
      client: "",
      site: "",
      ownerEmail: JAMES_EMAIL,
      transferredToName: "James Cain",
    },
    store,
  );
  const persisted = persistHisWoodRiverCards(store);
  const desk = packsForViewedDesk(owner, false, null, store);
  const jobs = jobsOnDesk(undefined, desk, false, companyScopeFor(owner), undefined, { includeSeeds: false });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: desk });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  assert.equal(persisted.some((row) => row.title === "2027 Aromatics Turnaround"), true);
  assert.equal(desk.filter((row) => row.title === "Wood River / T&M 2027-01 to 06").length, 1);
  assert.equal(desk.find((row) => row.title === "Wood River / T&M 2027-01 to 06")?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(desk.find((row) => row.title === "Wood River / T&M 2027-01 to 06")!, owner.email), "Nathan Boyte's desk.");
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTJ5D6"), true);
});

test("stale HIS leftover is James or any non-Nathan non-owner identity", () => {
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: JAMES_EMAIL }), true);
  assert.equal(
    isStaleHisLeftoverIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: NATHAN_DESK_EMAIL, transferredTo: JAMES_EMAIL }),
    true,
  );
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: "bccamp2@gmail.com" }), true);
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: NATHAN_DESK_EMAIL }), false);
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: owner.email }), false);
  assert.equal(isStaleHisLeftoverIdentity({ packId: "new-mtkigb-james", ownerEmail: JAMES_EMAIL, title: "New Turnaround estimate" }), false);
});

test("desktop leftover generation bust restamps HIS cards and leaves session keys", () => {
  const sessionKey = "hs_whats_new:1.51.1:owner";
  const jamesTm = {
    packId: "new-MTJ5D6-live",
    key: "new:new-MTJ5D6-live",
    title: "Wood River / T&M 2027-01 to 06",
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: JAMES_EMAIL,
    transferredTo: JAMES_EMAIL,
    transferredToName: "James Cain",
  };
  const jamesSample = {
    packId: "new-mtkigb-james",
    key: "new:new-mtkigb-james",
    title: "New Turnaround estimate",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 20,
    updatedAt: 21,
    ownerEmail: JAMES_EMAIL,
  };
  const store = memoryStore({
    [LENS_PACKS_LEGACY_KEY]: JSON.stringify({ james: [jamesTm, jamesSample] }),
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([jamesTm]),
    [sessionKey]: "1",
  });
  rememberLocalPack(
    {
      packId: jamesTm.packId,
      title: jamesTm.title,
      client: "",
      site: "",
      ownerEmail: JAMES_EMAIL,
      transferredTo: JAMES_EMAIL,
      transferredToName: "James Cain",
    },
    store,
  );
  rememberLocalPack(
    {
      packId: jamesSample.packId,
      title: jamesSample.title,
      client: jamesSample.client,
      site: jamesSample.site,
      ownerEmail: JAMES_EMAIL,
    },
    store,
  );

  const painted = packsForViewedDesk(owner, false, null, store);
  const tm = painted.find((row) => row.title === "Wood River / T&M 2027-01 to 06");
  const sample = painted.find((row) => row.packId === jamesSample.packId);
  const jobs = jobsOnDesk(undefined, painted, false, companyScopeFor(owner), undefined, { includeSeeds: false });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: painted });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const cbi = tree.find((row) => row.id === "cbi");

  assert.equal(leftoverGenIsCurrent(store), true);
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), HIS_LEFTOVER_GEN);
  assert.equal(store.getItem(sessionKey), "1");
  assert.equal(tm?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(tm!, owner.email), "Nathan Boyte's desk.");
  assert.equal(sample?.ownerEmail, JAMES_EMAIL);
  assert.equal(handoffMarkText(sample!, owner.email), "James Cain's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTJ5D6"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "New Turnaround estimate"), false);
  assert.equal(cbi?.sites.some((site) => site.jobs.some((job) => job.title === "New Turnaround estimate")), true);

  const persisted = readOwnerPacks(store);
  assert.equal(OWNER_PACKS_KEY, OWNER_PACKS_LEGACY_KEY);
  assert.equal(persisted.find((row) => row.title === "Wood River / T&M 2027-01 to 06")?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.ok(store.getItem(OWNER_PACKS_KEY)?.includes(NATHAN_DESK_EMAIL));
  assert.equal(store.getItem(OWNER_PACKS_KEY)?.includes(JAMES_EMAIL), false);

  const again = packsForViewedDesk(owner, false, null, store);
  assert.equal(again.find((row) => row.title === "Wood River / T&M 2027-01 to 06")?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(again.find((row) => row.title === "Wood River / T&M 2027-01 to 06")!, owner.email), "Nathan Boyte's desk.");
  assert.equal(store.getItem(sessionKey), "1");
});

test("stale HIS leftover restamps on every owner paint when leftover gen is already current", () => {
  const staleTm = {
    packId: "new-MTJ5D6-live",
    key: "new:new-MTJ5D6-live",
    title: "Wood River / T&M 2027-01 to 06",
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: JAMES_EMAIL,
    transferredTo: JAMES_EMAIL,
    transferredToName: "James Cain",
  };
  const store = memoryStore({
    [HIS_LEFTOVER_GEN_KEY]: "2",
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([staleTm]),
  });
  rememberLocalPack(
    {
      packId: staleTm.packId,
      title: staleTm.title,
      ownerEmail: JAMES_EMAIL,
      transferredTo: JAMES_EMAIL,
      transferredToName: "James Cain",
    },
    store,
  );
  assert.equal(leftoverHasStaleHisIdentity([staleTm]), true);
  assert.equal(leftoverGenIsCurrent(store), false);

  const painted = packsForViewedDesk(owner, false, null, store);
  const tm = painted.find((row) => row.title === staleTm.title);
  assert.equal(tm?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(tm!, owner.email), "Nathan Boyte's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), HIS_LEFTOVER_GEN);
  assert.equal(leftoverGenIsCurrent(store), true);
  assert.equal(readOwnerPacks(store).find((row) => row.title === staleTm.title)?.ownerEmail, NATHAN_DESK_EMAIL);

  writeOwnerPacks(
    [
      {
        ...staleTm,
        ownerEmail: JAMES_EMAIL,
        transferredTo: JAMES_EMAIL,
        transferredToName: "James Cain",
      },
    ],
    store,
  );
  rememberLocalPack(
    {
      packId: staleTm.packId,
      title: staleTm.title,
      ownerEmail: JAMES_EMAIL,
      transferredTo: JAMES_EMAIL,
      transferredToName: "James Cain",
      replaceHandoff: true,
    },
    store,
  );
  assert.equal(leftoverGenIsCurrent(store), true);
  assert.equal(leftoverHasStaleHisIdentity(readOwnerPacks(store)), true);

  const restamped = packsForViewedDesk(owner, false, null, store);
  const again = restamped.find((row) => row.title === staleTm.title);
  assert.equal(again?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(again!, owner.email), "Nathan Boyte's desk.");
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), HIS_LEFTOVER_GEN);
  assert.equal(readOwnerPacks(store).find((row) => row.title === staleTm.title)?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(leftoverHasStaleHisIdentity(readOwnerPacks(store)), false);
});

test("Benny leftover on HIS T&M is rewritten the same as James leftover", () => {
  const store = memoryStore({
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([
      {
        packId: HIS_TM_PACK_ID,
        key: `new:${HIS_TM_PACK_ID}`,
        title: "Wood River / T&M 2027-01 to 06",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 1,
        updatedAt: 2,
        ownerEmail: "bccamp2@gmail.com",
        transferredTo: "bccamp2@gmail.com",
      },
    ]),
  });
  bustHisLeftoverOnce(store);
  const desk = packsForViewedDesk(owner, false, null, store);
  const tm = desk.find((row) => row.packId === HIS_TM_PACK_ID);
  assert.equal(tm?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(tm!, owner.email), "Nathan Boyte's desk.");
  assert.ok(desk.some((row) => row.packId === HIS_AROMATICS_PACK_ID));
  assert.ok(desk.some((row) => row.packId === HIS_CAT2_PACK_ID));
});
