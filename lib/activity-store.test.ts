import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
    const ownerDesk = readFileSync(fileURLToPath(new URL("./owner-desk.ts", import.meta.url)), "utf8");
    assert.equal(/seedOwnerDemo|Owner desk · sign-in ok/.test(ownerDesk), false);
    const desk = readFileSync(fileURLToPath(new URL("../components/ActivityDesk.tsx", import.meta.url)), "utf8");
    assert.equal(/Demo owner rows/.test(desk), false);
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
