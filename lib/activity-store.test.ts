import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";

import {
  addActivity,
  forgetActivityCacheForTests,
  listActivity,
  resetActivityStoreForTests,
  useActivityVaultForTests,
} from "./activity-store.ts";
import { memoryDrive } from "./drive-estimates.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-activity-"));
process.env.ACTIVITY_STORE_PATH = join(dir, "activity.json");

beforeEach(() => {
  resetActivityStoreForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("activity vault persist", () => {
  it("does not invent a demo ledger", async () => {
    assert.deepEqual(await listActivity(), []);
  });

  it("keeps a real row after the local cache is wiped", async () => {
    const drive = memoryDrive();
    useActivityVaultForTests(drive);
    const row = await addActivity({
      kind: "sign-in",
      who: "Robert Henderson",
      detail: "Owner desk · sign-in ok",
    });
    forgetActivityCacheForTests();
    useActivityVaultForTests(drive);
    const listed = await listActivity();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, row.id);
    assert.equal(listed[0].detail, "Owner desk · sign-in ok");
  });
});
