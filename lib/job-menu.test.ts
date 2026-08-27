import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveMenuItem,
  deleteMenuItem,
  isActiveMenuItem,
  menuStatus,
  packsMissingFromVault,
  readJobMenu,
  recordTransferredMenuItem,
  unarchiveMenuItem,
  writeVaultSeen,
} from "./job-menu.ts";
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
  });

  it("evicts packs that left this desk on the vault list", () => {
    const store = memoryStore();
    writeVaultSeen(["new-cat2pit", "new-mine"], store);
    assert.deepEqual(packsMissingFromVault(["new-mine"], store), ["new-cat2pit"]);
    assert.deepEqual(packsMissingFromVault(["new-cat2pit", "new-mine"], store), []);
  });
});
