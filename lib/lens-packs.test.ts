import assert from "node:assert/strict";
import { test } from "node:test";
import { jobsOnDesk, seedJobs } from "./jobs.ts";
import {
  LENS_PACKS_KEY,
  packsForViewedDesk,
  readLensPacks,
  snapshotLensPack,
  writeLensPacks,
} from "./lens-packs.ts";
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
  assert.equal(ownerDesk.some((pack) => pack.packId === "new-mtaajdwa-f7539"), false);
});
