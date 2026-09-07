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
import { jobsOnDesk, seedJobs } from "./jobs.ts";
import type { StorageLike } from "./local-estimates.ts";
import { companyScopeFor } from "./companies.ts";
import { handoffMarkText } from "./handoff.ts";
import { JOB_MENU_KEY, menuForViewedDesk } from "./job-menu.ts";
import { jobTree } from "./job-tree.ts";
import { JAMES_EMAIL } from "./tester-seats.ts";
import {
  HIS_AROMATICS_FILE_ID,
  HIS_AROMATICS_FREEZE_FILE_ID,
  HIS_AROMATICS_PACK_ID,
  HIS_AROMATICS_STUB_ID,
  HIS_CAT2_FILE_ID,
  HIS_CAT2_PACK_ID,
  HIS_TM_FILE_ID,
  HIS_TM_JOB_CODE,
  HIS_TM_PACK_ID,
  HIS_TM_TITLE,
  NATHAN_DESK_EMAIL,
  applyHisIdentity,
  hisFileForPackId,
  hisKnownEstimateFiles,
  hisMatchForPack,
  hisWoodRiverCards,
  isPurgedHisLeftover,
  jobCodeFromPackId,
  leftoverHasPurgedHisCards,
  leftoverNeedsRewrite,
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

test("HIS known files include Aromatics + CAT only, never purged T&M or the thin stub", () => {
  const ids = hisKnownEstimateFiles().map((row) => row.fileId);
  assert.ok(ids.includes(HIS_AROMATICS_FILE_ID));
  assert.ok(ids.includes(HIS_CAT2_FILE_ID));
  assert.ok(!ids.includes(HIS_TM_FILE_ID));
  assert.ok(!ids.includes(HIS_AROMATICS_STUB_ID));
  assert.ok(!ids.includes(HIS_AROMATICS_FREEZE_FILE_ID));
  assert.notEqual(HIS_AROMATICS_FREEZE_FILE_ID, HIS_AROMATICS_FILE_ID);
  assert.equal(hisFileForPackId(HIS_AROMATICS_PACK_ID)?.fileId, HIS_AROMATICS_FILE_ID);
  assert.equal(hisFileForPackId(HIS_CAT2_PACK_ID)?.fileId, HIS_CAT2_FILE_ID);
  assert.equal(hisFileForPackId(HIS_TM_PACK_ID), null);
  assert.equal(hisFileForPackId("new-mtj5d6-longer-vault"), null);
  assert.equal(hisFileForPackId("new-mtj5d6-tm2027"), null);
  assert.equal(hisFileForPackId(HIS_TM_JOB_CODE), null);
});

test("HIS cards stay on Nathan's desk as Aromatics + CAT only", () => {
  const cards = hisWoodRiverCards();
  assert.deepEqual(
    cards.map((row) => row.packId).sort(),
    [HIS_AROMATICS_PACK_ID, HIS_CAT2_PACK_ID].sort(),
  );
  for (const card of cards) {
    assert.equal(card.ownerEmail, NATHAN_DESK_EMAIL);
    assert.equal(card.sharedWith, undefined);
  }
  assert.equal(cards.some((row) => row.packId === HIS_TM_PACK_ID || row.title === HIS_TM_TITLE), false);
});

test("owner first paint with empty local still shows Aromatics and CAT, never T&M", () => {
  const store = memoryStore();
  const cards = hisWoodRiverCards();
  assert.ok(cards.every((card) => localPackVisibleTo(owner, card)));
  const desk = packsForViewedDesk(owner, false, null, store);
  const titles = desk.map((row) => row.title);
  assert.ok(titles.includes("2027 Aromatics Turnaround"));
  assert.ok(titles.includes("Madison CAT 2 (Pit Stop)"));
  assert.ok(!titles.includes(HIS_TM_TITLE));
  const jobs = jobsOnDesk(undefined, desk, false);
  assert.ok(jobs.some((job) => job.title === "2027 Aromatics Turnaround"));
  assert.ok(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"));
  assert.ok(!jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE));
});

test("empty leftover cannot drop HIS cards already on the desk", () => {
  const existing = hisWoodRiverCards();
  const merged = mergeHisWoodRiverCards(existing);
  assert.ok(merged.some((row) => row.packId === HIS_AROMATICS_PACK_ID));
  assert.ok(merged.some((row) => row.packId === HIS_CAT2_PACK_ID));
  assert.ok(!merged.some((row) => row.packId === HIS_TM_PACK_ID || row.title === HIS_TM_TITLE));
  assert.equal(merged.filter((row) => row.title === "2027 Aromatics Turnaround").length, 1);
});

test("James sample on Wood River does not hide Aromatics and CAT; purged T&M stays off the desk", () => {
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
      title: HIS_TM_TITLE,
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
  const tm = painted.find((row) => row.title === HIS_TM_TITLE || row.packId === HIS_TM_PACK_ID);
  const jamesSample = painted.find((row) => row.packId === "new-mtkigb-james");
  assert.equal(hisMatchForPack(jamesSample), null);
  assert.equal(localPackToJob(jamesSample!).code, "EST-MTKIGB");
  assert.equal(tm, undefined);
  assert.equal(handoffMarkText(jamesSample!, owner.email), "James Cain's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(applyHisIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: JAMES_EMAIL }).ownerEmail, JAMES_EMAIL);
  assert.equal(isPurgedHisLeftover({ packId: HIS_TM_PACK_ID, title: HIS_TM_TITLE }), true);

  const jobs = jobsOnDesk(undefined, painted, false, companyScopeFor(owner), undefined, { includeSeeds: false });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: painted });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const cbi = tree.find((row) => row.id === "cbi");
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE), false);
  assert.equal(wood?.jobs.some((job) => job.title === "New Turnaround estimate"), false);
  assert.equal(cbi?.sites.some((site) => site.jobs.some((job) => job.title === "New Turnaround estimate")), true);
});

test("vault T&M leftover is dropped instead of painted", () => {
  const vault = {
    packId: "new-mtj5d6-from-vault",
    key: "new:new-mtj5d6-from-vault",
    title: HIS_TM_TITLE,
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 9,
    updatedAt: 10,
    ownerEmail: NATHAN_DESK_EMAIL,
    sharedWith: ["robertmhenderson582@gmail.com"],
  };
  const merged = mergeHisWoodRiverCards([vault]);
  assert.equal(merged.filter((row) => row.title === vault.title).length, 0);
  assert.equal(merged.some((row) => row.packId === vault.packId), false);
  assert.ok(merged.some((row) => row.packId === HIS_AROMATICS_PACK_ID));
  assert.ok(merged.some((row) => row.packId === HIS_CAT2_PACK_ID));
});

test("purged leftover T&M never matches a HIS file", () => {
  assert.equal(jobCodeFromPackId("new-MTJ5D6"), HIS_TM_JOB_CODE);
  assert.equal(jobCodeFromPackId("new-MTJ5D6-live"), HIS_TM_JOB_CODE);
  assert.equal(jobCodeFromPackId(HIS_TM_JOB_CODE), HIS_TM_JOB_CODE);
  assert.equal(jobCodeFromPackId("est-mtj5d6"), HIS_TM_JOB_CODE);
  assert.equal(hisFileForPackId("new-MTJ5D6"), null);
  assert.equal(hisFileForPackId("new-MTJ5D6-live"), null);
  assert.equal(hisFileForPackId(HIS_TM_JOB_CODE), null);
  assert.equal(hisFileForPackId("new-MTJ5D6-something"), null);
  assert.equal(hisMatchForPack({ packId: "new-MTJ5D6-live", ownerEmail: JAMES_EMAIL }), null);
  assert.equal(hisMatchForPack({ packId: HIS_TM_JOB_CODE, ownerEmail: JAMES_EMAIL }), null);
  assert.equal(hisMatchForPack({ packId: "new-other", title: HIS_TM_TITLE, ownerEmail: JAMES_EMAIL }), null);
  assert.equal(isPurgedHisLeftover({ packId: HIS_TM_JOB_CODE, title: HIS_TM_TITLE }), true);
  assert.equal(hisMatchForPack({ packId: "new-mtkigb-james", title: "New Turnaround estimate", ownerEmail: JAMES_EMAIL }), null);
  assert.equal(shouldPaintHisCards({ email: "Robert Henderson" }), true);
  assert.equal(shouldPaintHisCards({ email: owner.email }), true);
});

test("leftover T&M occupying the slot is dropped and Aromatics and CAT stay on Nathan's desk", () => {
  const leftover = {
    packId: "new-MTJ5D6-live",
    key: "new:new-MTJ5D6-live",
    title: HIS_TM_TITLE,
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
  assert.equal(painted.filter((row) => row.title === leftover.title).length, 0);
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(applyHisIdentity(leftover).ownerEmail, JAMES_EMAIL);
  assert.equal(isPurgedHisLeftover(leftover), true);
});

test("after leftover hydrate, persisted HIS extras still name Nathan's desk and drop T&M", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      packId: "new-MTJ5D6-live",
      title: HIS_TM_TITLE,
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
  assert.equal(desk.filter((row) => row.title === HIS_TM_TITLE).length, 0);
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE), false);
});

test("stale HIS leftover is James or any non-Nathan non-owner identity on live cards only", () => {
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_CAT2_PACK_ID, ownerEmail: JAMES_EMAIL }), true);
  assert.equal(
    isStaleHisLeftoverIdentity({ packId: HIS_CAT2_PACK_ID, ownerEmail: NATHAN_DESK_EMAIL, transferredTo: JAMES_EMAIL }),
    true,
  );
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_CAT2_PACK_ID, ownerEmail: "bccamp2@gmail.com" }), true);
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_CAT2_PACK_ID, ownerEmail: NATHAN_DESK_EMAIL }), false);
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_CAT2_PACK_ID, ownerEmail: owner.email }), false);
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_TM_PACK_ID, ownerEmail: JAMES_EMAIL }), false);
  assert.equal(isStaleHisLeftoverIdentity({ packId: HIS_TM_JOB_CODE, ownerEmail: JAMES_EMAIL, transferredToName: "James Cain" }), false);
  assert.equal(leftoverHasPurgedHisCards([{ packId: HIS_TM_PACK_ID, title: HIS_TM_TITLE }]), true);
  assert.equal(leftoverNeedsRewrite([{ packId: HIS_TM_JOB_CODE, title: HIS_TM_TITLE }]), true);
  assert.equal(isStaleHisLeftoverIdentity({ packId: "new-mtkigb-james", ownerEmail: JAMES_EMAIL, title: "New Turnaround estimate" }), false);
});

test("desktop leftover generation bust drops purged T&M and leaves session keys", () => {
  const sessionKey = "hs_whats_new:1.51.1:owner";
  const jamesTm = {
    packId: "new-MTJ5D6-live",
    key: "new:new-MTJ5D6-live",
    title: HIS_TM_TITLE,
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
  const tm = painted.find((row) => row.title === HIS_TM_TITLE);
  const sample = painted.find((row) => row.packId === jamesSample.packId);
  const jobs = jobsOnDesk(undefined, painted, false, companyScopeFor(owner), undefined, { includeSeeds: false });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: painted });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const cbi = tree.find((row) => row.id === "cbi");

  assert.equal(leftoverGenIsCurrent(store), true);
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), HIS_LEFTOVER_GEN);
  assert.equal(store.getItem(sessionKey), "1");
  assert.equal(tm, undefined);
  assert.equal(sample?.ownerEmail, JAMES_EMAIL);
  assert.equal(handoffMarkText(sample!, owner.email), "James Cain's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE), false);
  assert.equal(wood?.jobs.some((job) => job.title === "New Turnaround estimate"), false);
  assert.equal(cbi?.sites.some((site) => site.jobs.some((job) => job.title === "New Turnaround estimate")), true);

  const persisted = readOwnerPacks(store);
  assert.equal(OWNER_PACKS_KEY, OWNER_PACKS_LEGACY_KEY);
  assert.equal(persisted.some((row) => row.title === HIS_TM_TITLE), false);
  assert.equal(store.getItem(OWNER_PACKS_KEY)?.includes(HIS_TM_TITLE), false);

  const again = packsForViewedDesk(owner, false, null, store);
  assert.equal(again.some((row) => row.title === HIS_TM_TITLE), false);
  assert.equal(store.getItem(sessionKey), "1");
});

test("stale HIS leftover restamps on every owner paint when leftover gen is already current", () => {
  const staleCat = {
    packId: HIS_CAT2_PACK_ID,
    key: `new:${HIS_CAT2_PACK_ID}`,
    title: "Madison CAT 2 (Pit Stop)",
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
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([staleCat]),
  });
  rememberLocalPack(
    {
      packId: staleCat.packId,
      title: staleCat.title,
      ownerEmail: JAMES_EMAIL,
      transferredTo: JAMES_EMAIL,
      transferredToName: "James Cain",
    },
    store,
  );
  assert.equal(leftoverHasStaleHisIdentity([staleCat]), true);
  assert.equal(leftoverGenIsCurrent(store), false);

  const painted = packsForViewedDesk(owner, false, null, store);
  const cat = painted.find((row) => row.title === staleCat.title);
  assert.equal(cat?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(cat!, owner.email), "Nathan Boyte's desk.");
  assert.ok(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.ok(painted.some((row) => row.packId === HIS_CAT2_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  assert.equal(painted.some((row) => row.title === HIS_TM_TITLE), false);
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), HIS_LEFTOVER_GEN);
  assert.equal(leftoverGenIsCurrent(store), true);
  assert.equal(readOwnerPacks(store).find((row) => row.title === staleCat.title)?.ownerEmail, NATHAN_DESK_EMAIL);

  writeOwnerPacks(
    [
      {
        ...staleCat,
        ownerEmail: JAMES_EMAIL,
        transferredTo: JAMES_EMAIL,
        transferredToName: "James Cain",
      },
    ],
    store,
  );
  rememberLocalPack(
    {
      packId: staleCat.packId,
      title: staleCat.title,
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
  const again = restamped.find((row) => row.title === staleCat.title);
  assert.equal(again?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(handoffMarkText(again!, owner.email), "Nathan Boyte's desk.");
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), HIS_LEFTOVER_GEN);
  assert.equal(readOwnerPacks(store).find((row) => row.title === staleCat.title)?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.equal(leftoverHasStaleHisIdentity(readOwnerPacks(store)), false);
});

test("Benny leftover on purged T&M is dropped, not restamped", () => {
  const store = memoryStore({
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([
      {
        packId: HIS_TM_PACK_ID,
        key: `new:${HIS_TM_PACK_ID}`,
        title: HIS_TM_TITLE,
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
  assert.equal(desk.some((row) => row.packId === HIS_TM_PACK_ID || row.title === HIS_TM_TITLE), false);
  assert.ok(desk.some((row) => row.packId === HIS_AROMATICS_PACK_ID));
  assert.ok(desk.some((row) => row.packId === HIS_CAT2_PACK_ID));
});

function assertOwnerWoodRiverHis(store: StorageLike, leftoverPackId: string) {
  const painted = packsForViewedDesk(owner, false, null, store);
  const tm = painted.find((row) => row.title === HIS_TM_TITLE || row.packId === leftoverPackId);
  assert.equal(tm, undefined);
  assert.equal(applyHisIdentity({ packId: leftoverPackId, ownerEmail: JAMES_EMAIL }).ownerEmail, JAMES_EMAIL);
  const jobs = jobsOnDesk(undefined, painted, false, companyScopeFor(owner), menuForViewedDesk(false, store), {
    includeSeeds: false,
  });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: painted });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const cbi = tree.find((row) => row.id === "cbi");
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE), false);
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTKIGB" || job.title === "New Turnaround estimate"), false);
  assert.equal(
    cbi?.sites.some((site) => site.jobs.some((job) => job.code === "EST-MTKIGB" || job.title === "New Turnaround estimate")) ?? false,
    painted.some((row) => row.packId === "new-mtkigb-james"),
  );
  return { painted, wood, tm };
}

test("production leftover packId EST-MTJ5D6 is dropped and only Aromatics + CAT paint", () => {
  const leftover = {
    packId: HIS_TM_JOB_CODE,
    key: `job:${HIS_TM_JOB_CODE}`,
    title: HIS_TM_TITLE,
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: JAMES_EMAIL,
    transferredToName: "James Cain",
  };
  const store = memoryStore({
    [HIS_LEFTOVER_GEN_KEY]: HIS_LEFTOVER_GEN,
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([leftover]),
  });
  assert.equal(jobCodeFromPackId(HIS_TM_JOB_CODE), HIS_TM_JOB_CODE);
  assert.equal(hisFileForPackId(HIS_TM_JOB_CODE), null);
  assert.equal(leftoverHasStaleHisIdentity([leftover]), false);
  assert.equal(leftoverHasPurgedHisCards([leftover]), true);
  assert.equal(leftoverNeedsRewrite([leftover]), true);
  assert.equal(leftoverGenIsCurrent(store), true);
  const { painted, tm } = assertOwnerWoodRiverHis(store, leftover.packId);
  assert.equal(painted.filter((row) => row.title === leftover.title).length, 0);
  assert.equal(tm, undefined);
  assert.equal(readOwnerPacks(store).some((row) => row.title === leftover.title), false);
});

test("production leftover packId new-MTJ5D6-something is dropped the same as EST-MTJ5D6", () => {
  const leftover = {
    packId: "new-MTJ5D6-something",
    key: "new:new-MTJ5D6-something",
    title: HIS_TM_TITLE,
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: JAMES_EMAIL,
    transferredToName: "James Cain",
  };
  const store = memoryStore({
    [HIS_LEFTOVER_GEN_KEY]: HIS_LEFTOVER_GEN,
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([leftover]),
  });
  rememberLocalPack(
    {
      packId: leftover.packId,
      title: leftover.title,
      ownerEmail: JAMES_EMAIL,
      transferredToName: "James Cain",
    },
    store,
  );
  assert.equal(leftoverHasPurgedHisCards([leftover]), true);
  const { tm } = assertOwnerWoodRiverHis(store, leftover.packId);
  assert.equal(tm, undefined);
});

test("owner-stamped purged T&M leftover is dropped, not restamped to Nathan", () => {
  const leftover = {
    packId: HIS_TM_JOB_CODE,
    key: `job:${HIS_TM_JOB_CODE}`,
    title: HIS_TM_TITLE,
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: owner.email,
    transferredToName: "James Cain",
  };
  const store = memoryStore({
    [HIS_LEFTOVER_GEN_KEY]: HIS_LEFTOVER_GEN,
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([leftover]),
  });
  assert.equal(applyHisIdentity(leftover).ownerEmail, owner.email);
  assert.equal(applyHisIdentity(leftover).transferredToName, "James Cain");
  assertOwnerWoodRiverHis(store, leftover.packId);
});

test("job-menu leftover cannot hide HIS Aromatics or CAT 2 on owner Jobs", () => {
  const leftover = {
    packId: HIS_TM_JOB_CODE,
    key: `job:${HIS_TM_JOB_CODE}`,
    title: HIS_TM_TITLE,
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: JAMES_EMAIL,
    transferredToName: "James Cain",
  };
  const store = memoryStore({
    [HIS_LEFTOVER_GEN_KEY]: HIS_LEFTOVER_GEN,
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([leftover]),
    [JOB_MENU_KEY]: JSON.stringify({
      archived: [HIS_AROMATICS_PACK_ID, `job-${HIS_AROMATICS_PACK_ID}`, "2027 Aromatics Turnaround"],
      deleted: [HIS_CAT2_PACK_ID, `job-${HIS_CAT2_PACK_ID}`, leftover.packId, `job-${leftover.packId}`, HIS_TM_PACK_ID],
      transferred: [{ id: leftover.packId, title: leftover.title, toName: "James Cain", at: 1 }],
    }),
  });
  assertOwnerWoodRiverHis(store, leftover.packId);
  const menu = menuForViewedDesk(false, store);
  assert.equal(menu.deleted.some((id) => id === HIS_CAT2_PACK_ID), false);
  assert.equal(menu.archived.some((id) => id === HIS_AROMATICS_PACK_ID), false);
});

test("James CBI sample EST-MTKIGB stays off Wood River after purged T&M leftover is dropped", () => {
  const leftover = {
    packId: HIS_TM_JOB_CODE,
    key: `job:${HIS_TM_JOB_CODE}`,
    title: HIS_TM_TITLE,
    client: "",
    site: "",
    siteId: "",
    createdAt: 4,
    updatedAt: 9,
    ownerEmail: JAMES_EMAIL,
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
    [HIS_LEFTOVER_GEN_KEY]: HIS_LEFTOVER_GEN,
    [OWNER_PACKS_LEGACY_KEY]: JSON.stringify([leftover, jamesSample]),
  });
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
  writeLensPacks("james", [jamesSample], store);
  const { painted, wood } = assertOwnerWoodRiverHis(store, leftover.packId);
  const sample = painted.find((row) => row.packId === jamesSample.packId);
  assert.equal(localPackToJob(sample!).code, "EST-MTKIGB");
  assert.equal(sample?.ownerEmail, JAMES_EMAIL);
  assert.equal(handoffMarkText(sample!, owner.email), "James Cain's desk.");
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTKIGB"), false);
});

const nathan = { email: NATHAN_DESK_EMAIL, role: "tester" as const };
const james = { email: JAMES_EMAIL, role: "tester" as const };
const SEED_CODES = ["HS-8622", "TA-8841", "TM-8902", "ES-8710"];

function assertHisWoodRiverDesk(
  painted: ReturnType<typeof packsForViewedDesk>,
  viewingAs: boolean,
  scopeUser: { email: string; role: "owner" | "tester" },
) {
  const scope = companyScopeFor(scopeUser);
  const jobs = jobsOnDesk(seedJobs(), painted, viewingAs, scope, undefined, {
    includeSeeds: false,
  });
  const tree = jobTree({ scope, jobs, packs: painted });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const unassigned = tree
    .find((row) => row.id === "madison")
    ?.sites.find((site) => site.id === "site-unassigned");
  assert.equal(jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE), false);
  assert.equal(jobs.some((job) => SEED_CODES.includes(job.code)), false);
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === HIS_TM_JOB_CODE || job.title === HIS_TM_TITLE), false);
  assert.equal(unassigned?.jobs.some((job) => job.code === "HS-8622") ?? false, false);
  const aromatics = painted.find((row) => row.title === "2027 Aromatics Turnaround");
  const cat = painted.find((row) => row.title === "Madison CAT 2 (Pit Stop)");
  const tm = painted.find((row) => row.title === HIS_TM_TITLE);
  assert.equal(handoffMarkText(aromatics!, owner.email), "Nathan Boyte's desk.");
  assert.equal(handoffMarkText(cat!, owner.email), "Nathan Boyte's desk.");
  assert.equal(tm, undefined);
  return { jobs, tree, wood };
}

test("owner leftover catalog samples stay off View as Nathan and Back to me", () => {
  const store = memoryStore();
  writeOwnerPacks(
    [
      {
        packId: "job-8622",
        key: "new:job-8622",
        title: "Pre-outage HSE walkdown – flare / piperack",
        client: "Madison / P66",
        site: "Madison / P66",
        siteId: "site-unassigned",
        createdAt: 1,
        updatedAt: 1,
        ownerEmail: owner.email,
      },
      {
        packId: "job-8841",
        key: "new:job-8841",
        title: "Unit 3 turnaround — mechanical T&M",
        client: "Madison / P66",
        site: "Madison / P66",
        siteId: "site-unassigned",
        createdAt: 1,
        updatedAt: 1,
        ownerEmail: owner.email,
      },
    ],
    store,
  );
  writeLensPacks(
    "nathan",
    [
      {
        packId: "HS-8622",
        key: "new:HS-8622",
        title: "Pre-outage HSE walkdown — flare / piperack",
        client: "Madison / P66",
        site: "Madison / P66",
        siteId: "site-unassigned",
        createdAt: 1,
        updatedAt: 1,
        ownerEmail: owner.email,
      },
    ],
    store,
  );
  const viewed = packsForViewedDesk(nathan, true, "nathan", store);
  assertHisWoodRiverDesk(viewed, true, nathan);
  assert.equal(viewed.some((pack) => /walkdown|unit 3/i.test(pack.title)), false);
  const back = packsForViewedDesk(owner, false, null, store);
  assertHisWoodRiverDesk(back, false, owner);
  assert.equal(back.some((pack) => /walkdown|unit 3/i.test(pack.title)), false);
});

test("View as Nathan paints Aromatics + CAT HIS jobs and no catalog seeds", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      packId: HIS_AROMATICS_PACK_ID,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      ownerEmail: NATHAN_DESK_EMAIL,
    },
    store,
  );
  rememberLocalPack(
    {
      packId: HIS_CAT2_PACK_ID,
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      ownerEmail: NATHAN_DESK_EMAIL,
    },
    store,
  );
  const painted = packsForViewedDesk(nathan, true, "nathan", store);
  assertHisWoodRiverDesk(painted, true, nathan);
});

test("Nathan login paints the same Aromatics + CAT HIS jobs and no catalog seeds", () => {
  const store = memoryStore();
  const painted = packsForViewedDesk(nathan, false, null, store);
  assertHisWoodRiverDesk(painted, false, nathan);
});

test("owner Back-to-me Jobs shows the two HIS cards as Nathan's desk and no seeds", () => {
  const store = memoryStore();
  const painted = packsForViewedDesk(owner, false, null, store);
  assertHisWoodRiverDesk(painted, false, owner);
});

test("James CBI sample EST-MTKIGB stays under CBI and View as James does not paint HIS cards", () => {
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
  const jamesDesk = packsForViewedDesk(james, true, "james", store);
  assert.equal(jamesDesk.some((row) => row.title === "2027 Aromatics Turnaround"), false);
  assert.equal(jamesDesk.some((row) => row.title === "Madison CAT 2 (Pit Stop)"), false);
  assert.equal(jamesDesk.some((row) => row.title === "Wood River / T&M 2027-01 to 06"), false);
  assert.equal(shouldPaintHisCards(james), false);

  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  const jobs = jobsOnDesk(undefined, ownerDesk, false, companyScopeFor(owner), undefined, { includeSeeds: false });
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: ownerDesk });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  const cbi = tree.find((row) => row.id === "cbi");
  assert.equal(localPackToJob(ownerDesk.find((row) => row.packId === "new-mtkigb-james")!).code, "EST-MTKIGB");
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTKIGB"), false);
  assert.equal(cbi?.sites.some((site) => site.jobs.some((job) => job.code === "EST-MTKIGB")), true);
});

test("live Aromatics and CAT leftovers are not replaced by identity-only stubs", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      packId: HIS_AROMATICS_PACK_ID,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      size: "live-aromatics-crew",
      ownerEmail: NATHAN_DESK_EMAIL,
    },
    store,
  );
  rememberLocalPack(
    {
      packId: HIS_CAT2_PACK_ID,
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      size: "live-cat-crew",
      ownerEmail: NATHAN_DESK_EMAIL,
    },
    store,
  );
  const viewed = packsForViewedDesk(nathan, true, "nathan", store);
  const own = packsForViewedDesk(nathan, false, null, store);
  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  for (const painted of [viewed, own, ownerDesk]) {
    const aromatics = painted.find((row) => row.title === "2027 Aromatics Turnaround");
    const cat = painted.find((row) => row.title === "Madison CAT 2 (Pit Stop)");
    assert.equal(aromatics?.packId, HIS_AROMATICS_PACK_ID);
    assert.equal(cat?.packId, HIS_CAT2_PACK_ID);
    assert.equal(aromatics?.size, "live-aromatics-crew");
    assert.equal(cat?.size, "live-cat-crew");
    assert.equal(painted.filter((row) => row.title === "2027 Aromatics Turnaround").length, 1);
    assert.equal(painted.filter((row) => row.title === "Madison CAT 2 (Pit Stop)").length, 1);
  }
});
