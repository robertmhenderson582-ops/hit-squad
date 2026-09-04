import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveMenuItem,
  clearHisJobMenuLeftover,
  clearTransferredMenuItem,
  deleteMenuItem,
  isActiveMenuItem,
  jobMenuKey,
  menuForViewedDesk,
  menuSeatForDesk,
  menuStatus,
  omitDeletedJobs,
  packsMissingFromVault,
  readJobMenu,
  recordTransferredMenuItem,
  unarchiveMenuItem,
  writeVaultSeen,
} from "./job-menu.ts";
import { writeEstimateStatus } from "./estimate-status.ts";
import type { StorageLike } from "./local-estimates.ts";

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

describe("job menu archive and delete", () => {
  it("archives a sample without deleting Cat 2", () => {
    const store = memoryStore();
    archiveMenuItem({ id: "est-u3", title: "Unit 3 turnaround — mechanical package" }, store);
    archiveMenuItem({ id: "job-8841", title: "Unit 3 turnaround — mechanical T&M" }, store);
    assert.equal(menuStatus({ id: "est-u3" }, readJobMenu(store)), "archived");
    assert.equal(isActiveMenuItem({ id: "est-u3" }, readJobMenu(store)), false);
    assert.equal(isActiveMenuItem({ id: "new-cat2pit" }, readJobMenu(store)), true);
    assert.equal(isActiveMenuItem({ id: "job-new-cat2pit", packId: "new-cat2pit" }, readJobMenu(store)), true);
    unarchiveMenuItem({ id: "est-u3" }, store);
    assert.equal(isActiveMenuItem({ id: "est-u3" }, readJobMenu(store)), true);
  });

  it("delete is per-seat and confirm-shaped: only the ids passed are removed", () => {
    const store = memoryStore();
    deleteMenuItem({ id: "est-coker", title: "Coker drum valve package — T&M" }, store);
    assert.equal(menuStatus({ id: "est-coker" }, readJobMenu(store)), "deleted");
    assert.equal(isActiveMenuItem({ id: "new-cat2pit" }, readJobMenu(store)), true);
    assert.equal(isActiveMenuItem({ id: "est-tower" }, readJobMenu(store)), true);
  });

  it("marks a handed-off job as transferred and drops it from the active list", () => {
    const store = memoryStore();
    recordTransferredMenuItem({ id: "new-cat2pit", title: "Cat 2 Pit Stop", toName: "Nathan Boyte" }, store);
    const menu = readJobMenu(store);
    assert.equal(menuStatus({ id: "new-cat2pit" }, menu), "transferred");
    assert.equal(menu.transferred[0]?.toName, "Nathan Boyte");
    assert.equal(isActiveMenuItem({ id: "job-new-cat2pit", packId: "new-cat2pit" }, menu), false);
    assert.equal(menuForViewedDesk(true, store).transferred.length, 0);
    assert.equal(isActiveMenuItem({ id: "new-cat2pit" }, menuForViewedDesk(true, store)), true);
    assert.equal(menuForViewedDesk(false, store).transferred[0]?.toName, "Nathan Boyte");
    clearTransferredMenuItem({ id: "new-cat2pit" }, store);
    assert.equal(readJobMenu(store).transferred.length, 0);
    assert.equal(isActiveMenuItem({ id: "new-cat2pit" }, readJobMenu(store)), true);
  });

  it("deletes HS-8622 on the viewed Nathan desk and keeps it gone after a re-read", () => {
    const store = memoryStore();
    const hse = { id: "job-8622", title: "Pre-outage HSE walkdown — flare / piperack" };
    const cat2 = { id: "job-new-mtaajdwa-f7539", packId: "new-mtaajdwa-f7539", title: "Madison CAT 2 (Pit Stop)" };
    deleteMenuItem(hse, store, "nathan");
    const viewed = menuForViewedDesk(true, store, "nathan");
    assert.equal(jobMenuKey("nathan"), "hs_job_menu_v1:nathan");
    assert.equal(menuStatus(hse, viewed), "deleted");
    assert.equal(isActiveMenuItem(hse, viewed), false);
    assert.equal(isActiveMenuItem(cat2, viewed), true);
    assert.deepEqual(omitDeletedJobs([hse, cat2], viewed).map((row) => row.id), ["job-new-mtaajdwa-f7539"]);
    assert.equal(menuStatus(hse, menuForViewedDesk(true, store, "nathan")), "deleted");
    assert.equal(isActiveMenuItem(hse, menuForViewedDesk(false, store)), true);
    archiveMenuItem(cat2, store, "nathan");
    assert.equal(menuStatus(cat2, menuForViewedDesk(true, store, "nathan")), "archived");
    assert.equal(isActiveMenuItem(cat2, menuForViewedDesk(false, store)), true);
  });

  it("Awarded jobs archive but delete is a no-op on every seat", () => {
    const store = memoryStore();
    const awarded = { id: "job-new-awarded", packId: "new-awarded", title: "Awarded bank" };
    writeEstimateStatus("new-awarded", "Awarded", store);
    deleteMenuItem(awarded, store);
    deleteMenuItem(awarded, store, "nathan");
    assert.equal(menuStatus(awarded, readJobMenu(store)), null);
    assert.equal(menuStatus(awarded, menuForViewedDesk(true, store, "nathan")), null);
    archiveMenuItem(awarded, store, "nathan");
    assert.equal(menuStatus(awarded, menuForViewedDesk(true, store, "nathan")), "archived");
    assert.equal(isActiveMenuItem(awarded, menuForViewedDesk(true, store, "nathan")), false);
  });

  it("Nathan login and View as Nathan share the nathan seat menu", () => {
    assert.equal(menuSeatForDesk(true, "nathan"), "nathan");
    assert.equal(menuSeatForDesk(false, null, { email: "nathanboyte@gmail.com" }), "nathan");
    assert.equal(menuSeatForDesk(false, null, { email: "robertmhenderson582@gmail.com" }), null);
    assert.equal(menuSeatForDesk(true, "james"), "james");
  });

  it("Nathan seat delete of EST-MTJ5D6 sticks after leftover rewrite", () => {
    const store = memoryStore();
    const tm = { id: "job-EST-MTJ5D6", packId: "EST-MTJ5D6", title: "Wood River / T&M 2027-01 to 06" };
    const cat2 = { id: "job-new-mtaajdwa-f7539", packId: "new-mtaajdwa-f7539", title: "Madison CAT 2 (Pit Stop)" };
    deleteMenuItem(tm, store, "nathan");
    archiveMenuItem(cat2, store, "nathan");
    clearHisJobMenuLeftover(store, "nathan");
    clearHisJobMenuLeftover(store);
    const viewed = menuForViewedDesk(true, store, "nathan");
    const login = menuForViewedDesk(false, store, null, { email: "nathanboyte@gmail.com" });
    assert.equal(menuStatus(tm, viewed), "deleted");
    assert.equal(menuStatus(cat2, viewed), "archived");
    assert.equal(menuStatus(tm, login), "deleted");
    assert.equal(isActiveMenuItem(tm, viewed), false);
    assert.deepEqual(omitDeletedJobs([tm, cat2], viewed, false).map((row) => row.id), [cat2.id]);
    assert.equal(menuStatus(tm, menuForViewedDesk(false, store)), null);
    const seedTm = { id: "job-new-mtj5d6", packId: "new-mtj5d6", title: tm.title };
    assert.deepEqual(omitDeletedJobs([seedTm, cat2], viewed, false).map((row) => row.id), [cat2.id]);
  });

  it("rewrites owner job-menu leftover so HIS cards stay listed", () => {
    const store = memoryStore();
    const aromatics = { id: "job-new-mtj7bvtk-akmei", packId: "new-mtj7bvtk-akmei", title: "2027 Aromatics Turnaround" };
    const cat2 = { id: "job-new-mtaajdwa-f7539", packId: "new-mtaajdwa-f7539", title: "Madison CAT 2 (Pit Stop)" };
    const tm = { id: "job-EST-MTJ5D6", packId: "EST-MTJ5D6", title: "Wood River / T&M 2027-01 to 06" };
    deleteMenuItem(aromatics, store);
    archiveMenuItem(cat2, store);
    deleteMenuItem(tm, store);
    clearHisJobMenuLeftover(store);
    const menu = readJobMenu(store);
    assert.equal(menu.deleted.length, 0);
    assert.equal(menu.archived.length, 0);
    assert.deepEqual(omitDeletedJobs([aromatics, cat2, tm], menu, true).map((row) => row.id), [
      aromatics.id,
      cat2.id,
      tm.id,
    ]);
  });

  it("evicts packs that left this desk on the vault list", () => {
    const store = memoryStore();
    writeVaultSeen(["new-cat2pit", "new-mine"], store);
    assert.deepEqual(packsMissingFromVault(["new-mine"], store), ["new-cat2pit"]);
    assert.deepEqual(packsMissingFromVault(["new-cat2pit", "new-mine"], store), []);
  });
});
