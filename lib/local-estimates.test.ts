import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { newEstimateKey } from "./estimate-open.ts";
import {
  deleteLocalPack,
  listLocalPacks,
  localPackToEstimate,
  mergeLocalBoard,
  mergeLocalEstimates,
  mergeLocalJobs,
  normalizePackTitle,
  packIdFromStoreKey,
  PACK_TITLE_MAX,
  rememberLocalPack,
  renameLocalPackTitle,
  scanStoredPackIds,
  siteIdFromSite,
  storageKeyForPack,
  type StorageLike,
} from "./local-estimates.ts";
import type { EstimateRecord, ForgebookBoard, JobRecord } from "./types.ts";

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
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] ?? null;
    },
  };
}

const SAMPLES: EstimateRecord[] = [
  { id: "est-u3", title: "Unit 3 turnaround — mechanical package" } as EstimateRecord,
  { id: "est-coker", title: "Coker drum valve package — T&M" } as EstimateRecord,
  { id: "est-tower", title: "Cooling-tower basin repair" } as EstimateRecord,
];

describe("local estimate packs", () => {
  it("remembers a typed title and keeps the same pack key as Crew storage", () => {
    const store = memoryStore();
    const packId = "new-cat2pit";
    const saved = rememberLocalPack(
      {
        packId,
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    assert.ok(saved);
    assert.equal(saved.key, newEstimateKey(packId));
    assert.equal(storageKeyForPack(packId), "new:new-cat2pit");
    assert.equal(siteIdFromSite("Wood River — Roxana, IL"), "site-madison");
    assert.equal(siteIdFromSite("Shop", "CBI"), "site-shop");
    const listed = listLocalPacks(store);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, "Cat 2 Pit Stop");
    assert.equal(listed[0].packId, packId);
    assert.equal(localPackToEstimate(listed[0]).id, packId);
    const createdAt = listed[0].createdAt;
    const again = rememberLocalPack(
      {
        packId,
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    assert.equal(again?.createdAt, createdAt);
    assert.ok((again?.updatedAt || 0) >= createdAt);
  });

  it("recovers orphan new: keys so a lost URL still lists the pack", () => {
    const packId = "new-mtader5i";
    const key = newEstimateKey(packId);
    const store = memoryStore({
      [`${CREW_STORE_PREFIX}${key}`]: JSON.stringify({ support: [{ id: "sup-1", position: "Tool Room Attendant" }] }),
      [`${PHASE_STORE_PREFIX}${key}`]: JSON.stringify({ phases: [] }),
    });
    assert.deepEqual(scanStoredPackIds(store), [packId]);
    assert.equal(packIdFromStoreKey(key), packId);
    const listed = listLocalPacks(store);
    assert.equal(listed[0].packId, packId);
    assert.equal(listed[0].title, "Working estimate");
  });

  it("merges local packs onto the three sample workbooks without replacing them", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    const packs = listLocalPacks(store);
    const estimates = mergeLocalEstimates(SAMPLES, packs);
    assert.deepEqual(
      estimates.map((row) => row.id),
      ["est-u3", "est-coker", "est-tower", "new-cat2pit"],
    );
    assert.equal(estimates.find((row) => row.id === "new-cat2pit")?.title, "Cat 2 Pit Stop");
    const jobs = mergeLocalJobs([{ id: "job-8841" } as JobRecord], packs);
    assert.equal(jobs.some((job) => job.title === "Cat 2 Pit Stop"), true);
    const board = mergeLocalBoard({ estimates: SAMPLES } as ForgebookBoard, packs);
    assert.equal(board.estimates.length, 4);
  });

  it("deletes one local pack without wiping other leftover work", () => {
    const store = memoryStore();
    rememberLocalPack(
      { packId: "new-sample1", title: "Old sample", client: "Phillips 66", site: "Wood River — Roxana, IL" },
      store,
    );
    rememberLocalPack(
      { packId: "new-cat2pit", title: "Cat 2 Pit Stop", client: "Phillips 66", site: "Wood River — Roxana, IL" },
      store,
    );
    deleteLocalPack("new-sample1", store);
    const listed = listLocalPacks(store);
    assert.deepEqual(
      listed.map((row) => row.packId),
      ["new-cat2pit"],
    );
    assert.equal(listed[0].title, "Cat 2 Pit Stop");
  });

  it("renames the pack title from Job setup onto the card and rejects an empty name", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-nathan-tm",
        title: "Working estimate",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    assert.equal(normalizePackTitle("   "), null);
    assert.equal(normalizePackTitle(""), null);
    assert.equal(renameLocalPackTitle("new-nathan-tm", "   ", store), null);
    assert.equal(listLocalPacks(store)[0].title, "Working estimate");

    const renamed = renameLocalPackTitle("new-nathan-tm", "  Nathan T&M book  ", store);
    assert.equal(renamed?.title, "Nathan T&M book");
    const listed = listLocalPacks(store);
    assert.equal(listed[0].title, "Nathan T&M book");
    assert.equal(localPackToEstimate(listed[0]).title, "Nathan T&M book");
    assert.equal(mergeLocalJobs([], listed)[0]?.title, "Nathan T&M book");
    assert.equal(mergeLocalEstimates([], listed)[0]?.title, "Nathan T&M book");

    const long = "N".repeat(PACK_TITLE_MAX + 20);
    assert.equal(normalizePackTitle(long)?.length, PACK_TITLE_MAX);
    assert.equal(renameLocalPackTitle("new-nathan-tm", long, store)?.title.length, PACK_TITLE_MAX);
    assert.equal(renameLocalPackTitle("est-u3", "Nope", store), null);
  });

  it("clears leftover transfer marks when a returned pack is applied", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "nathanboyte@gmail.com",
        transferredFrom: "robertmhenderson582@gmail.com",
        transferredFromName: "Robert Henderson",
        transferredTo: "nathanboyte@gmail.com",
      },
      store,
    );
    const again = rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
        replaceHandoff: true,
      },
      store,
    );
    assert.equal(again?.ownerEmail, "robertmhenderson582@gmail.com");
    assert.equal(again?.transferredFrom, undefined);
    assert.equal(again?.transferredFromName, undefined);
    assert.equal(again?.transferredTo, undefined);
  });
});
