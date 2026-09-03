import test from "node:test";
import assert from "node:assert/strict";
import { localPackToJob } from "./local-estimates.ts";
import { localPackVisibleTo } from "./estimate-scope.ts";
import { packsForViewedDesk } from "./lens-packs.ts";
import { jobsOnDesk } from "./jobs.ts";
import type { StorageLike } from "./local-estimates.ts";
import {
  HIS_AROMATICS_FILE_ID,
  HIS_AROMATICS_PACK_ID,
  HIS_AROMATICS_STUB_ID,
  HIS_CAT2_FILE_ID,
  HIS_CAT2_PACK_ID,
  HIS_TM_FILE_ID,
  HIS_TM_PACK_ID,
  NATHAN_DESK_EMAIL,
  hisFileForPackId,
  hisKnownEstimateFiles,
  hisWoodRiverCards,
  mergeHisWoodRiverCards,
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
