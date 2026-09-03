import assert from "node:assert/strict";
import { test } from "node:test";
import { jobsOnDesk, seedJobs } from "./jobs.ts";
import {
  LENS_PACKS_KEY,
  LENS_PACKS_LEGACY_KEY,
  OWNER_PACKS_KEY,
  OWNER_PACKS_LEGACY_KEY,
  findDeskPack,
  isJobsLeftoverKey,
  ownerDeskHasImmediateWork,
  packsForViewedDesk,
  readLensPacks,
  readOwnerPacks,
  snapshotLensPack,
  writeLensPacks,
  writeOwnerPacks,
} from "./lens-packs.ts";
import { HIS_LEFTOVER_GEN_KEY, NATHAN_DESK_EMAIL } from "./his-wood-river.ts";
import { jobTree } from "./job-tree.ts";
import { deleteLocalPack, rememberLocalPack, type StorageLike } from "./local-estimates.ts";

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
  transferredFrom: "robertmhenderson582@gmail.com",
  transferredFromName: "Robert Henderson",
};

const nathan = { email: "nathanboyte@gmail.com", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", role: "owner" as const };

test("Follow first paint uses the last hydrated Nathan packs, not owner seed jobs", () => {
  const store = memoryStore();
  writeLensPacks("nathan", [snapshotLensPack(cat2)], store);
  assert.equal(store.getItem(LENS_PACKS_KEY)?.includes("new-mtaajdwa-f7539"), true);
  assert.equal(readLensPacks("nathan", store)[0]?.transferredFromName, "Robert Henderson");

  const packs = packsForViewedDesk(nathan, true, "nathan", store);
  assert.equal(packs.length, 1);
  assert.equal(packs[0]?.title, "Madison CAT 2 (Pit Stop)");
  const jobs = jobsOnDesk([], packs, true);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.title, "Madison CAT 2 (Pit Stop)");
  assert.equal(jobs.some((job) => job.id === "job-8841"), false);
  assert.notEqual(jobs.length, seedJobs().length);
});

test("leftover owner flush does not wipe the Follow seat snapshot", () => {
  const store = memoryStore();
  rememberLocalPack(cat2, store);
  writeLensPacks("nathan", [snapshotLensPack(cat2)], store);
  deleteLocalPack("new-mtaajdwa-f7539", store);
  const live = packsForViewedDesk(nathan, true, "nathan", store);
  assert.equal(live[0]?.packId, "new-mtaajdwa-f7539");
  assert.equal(live[0]?.transferredFrom, "robertmhenderson582@gmail.com");

  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-mtaajdwa-f7539"), true);
});

test("owner first paint uses the last snapshot even before the lens user is ready", () => {
  const store = memoryStore();
  writeOwnerPacks(
    [
      snapshotLensPack({
        packId: "new-aromatics-2027",
        key: "new:new-aromatics-2027",
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 1,
        updatedAt: 2,
        ownerEmail: owner.email,
      }),
      snapshotLensPack(cat2),
    ],
    store,
  );
  const beforeLens = packsForViewedDesk(null, false, null, store);
  assert.equal(beforeLens.some((pack) => pack.packId === "new-aromatics-2027"), true);
  assert.equal(beforeLens.some((pack) => pack.packId === "new-mtaajdwa-f7539"), true);
});

test("owner first paint includes local, last snapshot, and lens packs without waiting a tick", () => {
  const store = memoryStore();
  const aromatics = {
    packId: "new-aromatics-2027",
    key: "new:new-aromatics-2027",
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 1,
    updatedAt: 2,
    ownerEmail: owner.email,
  };
  rememberLocalPack(aromatics, store);
  writeOwnerPacks([snapshotLensPack(cat2)], store);
  writeLensPacks("nathan", [snapshotLensPack({ ...cat2, sharedWith: [owner.email] })], store);
  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-aromatics-2027"), true);
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-mtaajdwa-f7539"), true);
  assert.equal(ownerDesk.some((pack) => pack.title === "Madison CAT 2 (Pit Stop)"), true);
});

test("findDeskPack reads live local first, then the View as snapshot", () => {
  const store = memoryStore();
  writeLensPacks("nathan", [snapshotLensPack({ ...cat2, sharedWith: [owner.email] })], store);
  assert.equal(findDeskPack("new-mtaajdwa-f7539", "nathan", store)?.sharedWith?.[0], owner.email);
  rememberLocalPack({ ...cat2, sharedWith: [] }, store);
  assert.deepEqual(findDeskPack("new-mtaajdwa-f7539", "nathan", store)?.sharedWith, []);
});

test("owner Back-to-me Jobs includes a pack Nathan shared with the owner", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      ...cat2,
      transferredFrom: undefined,
      transferredFromName: undefined,
      sharedWith: [owner.email],
    },
    store,
  );
  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-mtaajdwa-f7539"), true);
  assert.equal(ownerDesk.find((pack) => pack.packId === "new-mtaajdwa-f7539")?.ownerEmail, nathan.email);
  const jobs = jobsOnDesk([], ownerDesk, false);
  assert.equal(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
});

test("owner first paint includes local and vault packs without waiting a tick", () => {
  const store = memoryStore();
  const aromatics = {
    packId: "new-aromatics-2027",
    key: "new:new-aromatics-2027",
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 1,
    updatedAt: 2,
    ownerEmail: nathan.email,
    transferredFrom: owner.email,
    transferredFromName: "Robert Henderson",
    transferredTo: nathan.email,
  };
  const shared = {
    packId: "new-mtj5d6",
    key: "new:new-mtj5d6",
    title: "Wood River / T&M 2027-01 to 06",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 1,
    updatedAt: 2,
    ownerEmail: nathan.email,
    sharedWith: [owner.email],
  };
  rememberLocalPack(shared, store);
  writeLensPacks("nathan", [snapshotLensPack(aromatics), snapshotLensPack(cat2)], store);
  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  assert.equal(ownerDeskHasImmediateWork(owner, store), true);
  assert.equal(ownerDesk.some((pack) => pack.title === "2027 Aromatics Turnaround"), true);
  assert.equal(ownerDesk.some((pack) => pack.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(ownerDesk.some((pack) => pack.title === "Wood River / T&M 2027-01 to 06"), true);
  const jobs = jobsOnDesk(undefined, ownerDesk, false);
  assert.equal(jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: ownerDesk });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Wood River / T&M 2027-01 to 06"), true);
});

test("owner first paint with empty local still has Wood River HIS cards", () => {
  const store = memoryStore();
  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-mtj7bvtk-akmei"), true);
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-mtaajdwa-f7539"), true);
  assert.equal(ownerDesk.some((pack) => pack.title === "Wood River / T&M 2027-01 to 06"), true);
  assert.equal(ownerDesk.find((pack) => pack.packId === "new-mtj7bvtk-akmei")?.ownerEmail, nathan.email);
  const jobs = jobsOnDesk(undefined, ownerDesk, false);
  assert.equal(jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(jobs.some((job) => job.code === "EST-MTJ5D6"), true);
  const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: ownerDesk });
  const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
  assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(wood?.jobs.some((job) => job.code === "EST-MTJ5D6"), true);
});

test("empty vault leftover cannot drop existing packs from the Jobs tree", () => {
  const store = memoryStore();
  rememberLocalPack(
    {
      packId: "new-aromatics-2027",
      key: "new:new-aromatics-2027",
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: owner.email,
    },
    store,
  );
  writeOwnerPacks([snapshotLensPack(cat2)], store);
  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  const afterEmptyVault = packsForViewedDesk(owner, false, null, store);
  assert.equal(afterEmptyVault.some((pack) => pack.packId === "new-aromatics-2027"), true);
  assert.equal(afterEmptyVault.some((pack) => pack.packId === "new-mtaajdwa-f7539"), true);
  const jobs = jobsOnDesk([], afterEmptyVault, false);
  assert.equal(jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
  assert.equal(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
  assert.equal(jobsOnDesk([], ownerDesk, false).length, jobs.length);
});

test("signed-in leftover wipe rewrites v1 Jobs keys only and keeps session marks", () => {
  assert.equal(LENS_PACKS_KEY, "hs_lens_packs_v1");
  assert.equal(OWNER_PACKS_KEY, "hs_owner_packs_v1");
  assert.equal(LENS_PACKS_KEY, LENS_PACKS_LEGACY_KEY);
  assert.equal(OWNER_PACKS_KEY, OWNER_PACKS_LEGACY_KEY);
  assert.equal(isJobsLeftoverKey(LENS_PACKS_KEY), true);
  assert.equal(isJobsLeftoverKey("hs_whats_new:1.51.1:owner"), false);
  assert.equal(isJobsLeftoverKey("hs_session"), false);

  const keep = "hs_whats_new:1.51.1:owner";
  const removed: string[] = [];
  const data: Record<string, string> = {
    [LENS_PACKS_KEY]: JSON.stringify({
      nathan: [snapshotLensPack(cat2)],
      james: [
        snapshotLensPack({
          ...cat2,
          packId: "new-mtj5d6",
          key: "new:new-mtj5d6",
          title: "Wood River / T&M 2027-01 to 06",
          ownerEmail: "jameshcainjr@gmail.com",
          transferredTo: "jameshcainjr@gmail.com",
          transferredToName: "James Cain",
        }),
      ],
    }),
    [OWNER_PACKS_KEY]: JSON.stringify([
      snapshotLensPack({
        ...cat2,
        packId: "new-mtj5d6",
        key: "new:new-mtj5d6",
        title: "Wood River / T&M 2027-01 to 06",
        ownerEmail: "jameshcainjr@gmail.com",
      }),
    ]),
    [keep]: "1",
  };
  const store = {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      removed.push(key);
      delete data[key];
    },
  };

  const ownerDesk = packsForViewedDesk(owner, false, null, store);
  assert.equal(store.getItem(HIS_LEFTOVER_GEN_KEY), "2");
  assert.equal(store.getItem(keep), "1");
  assert.equal(removed.every((key) => isJobsLeftoverKey(key)), true);
  assert.equal(store.getItem(OWNER_PACKS_KEY)?.includes("jameshcainjr@gmail.com"), false);
  assert.equal(readLensPacks("nathan", store)[0]?.packId, "new-mtaajdwa-f7539");
  assert.equal(readLensPacks("james", store).some((row) => row.title === "Wood River / T&M 2027-01 to 06"), false);
  assert.equal(readOwnerPacks(store).find((row) => row.title === "Wood River / T&M 2027-01 to 06")?.ownerEmail, NATHAN_DESK_EMAIL);
  assert.ok(ownerDesk.some((pack) => pack.title === "2027 Aromatics Turnaround"));
  assert.ok(ownerDesk.some((pack) => pack.title === "Madison CAT 2 (Pit Stop)"));
});
