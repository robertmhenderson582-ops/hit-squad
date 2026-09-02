import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { QUALITY_BRIEFS_VAULT_KIND, QUALITY_BRIEFS_VAULT_NAME, readVaultJson } from "./drive-data.ts";
import { memoryDrive } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  mergeLeadBriefs,
  publicBrief,
  resetLeadBriefStoreForTests,
  saveStoredBrief,
  staleWarmLeadBriefInstanceForTests,
  useLeadBriefVaultForTests,
  type StoredLeadBrief,
} from "./lead-brief-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-briefs-"));
const CHANCE = "chancec318@yahoo.com";

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function brief(over: Partial<StoredLeadBrief> = {}): StoredLeadBrief {
  return {
    id: "brief-quality-chancec318@yahoo.com",
    kind: "quality",
    who: CHANCE,
    whoName: "Chance Middlebrooks",
    describe: "QC forms",
    files: [{ name: "ncr.pdf", type: "application/pdf", data: "JVBERi0x" }],
    savedAt: "2026-09-02 12:00:00",
    ...over,
  };
}

describe("lead brief store", { concurrency: 1 }, () => {
  it("Chance Quality Save persists files to the vault and strips bytes on the public row", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "quality"));
    useLeadBriefVaultForTests(drive);
    const saved = await saveStoredBrief({
      kind: "quality",
      who: CHANCE,
      whoName: "Chance Middlebrooks",
      describe: "Drop the NCR form",
      files: [{ name: "ncr.pdf", type: "application/pdf", data: "JVBERi0x" }],
    });
    assert.equal(saved.who, CHANCE);
    assert.equal(saved.files[0]?.name, "ncr.pdf");
    assert.equal(saved.files[0]?.data, "JVBERi0x");

    staleWarmLeadBriefInstanceForTests("quality");
    const mine = await listStoredBriefs("quality", CHANCE);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]?.files[0]?.name, "ncr.pdf");
    assert.equal((await listStoredBriefs("quality", "nathanboyte@gmail.com")).length, 0);

    const vault = await readVaultJson<{ briefs?: StoredLeadBrief[] }>(drive, QUALITY_BRIEFS_VAULT_NAME, QUALITY_BRIEFS_VAULT_KIND);
    assert.equal(vault?.briefs?.[0]?.files[0]?.data, "JVBERi0x");
    assert.deepEqual(publicBrief(saved).files, [{ name: "ncr.pdf", type: "application/pdf" }]);
  });

  it("hydrate merge keeps a cache-only Quality brief when the vault is thinner", async () => {
    const richer = mergeLeadBriefs([brief({ describe: "", files: [] })], [brief()]);
    assert.equal(richer[0]?.describe, "QC forms");
    assert.equal(richer[0]?.files[0]?.name, "ncr.pdf");
    const union = mergeLeadBriefs([brief()], [brief({ id: "brief-quality-other", who: "wlanderno@yahoo.com", whoName: "Wendell" })]);
    assert.equal(union.length, 2);
  });

  it("a failed Drive write throws and does not look saved", async () => {
    resetLeadBriefStoreForTests(join(dir, "fail"));
    useLeadBriefVaultForTests({
      configured: true,
      async listJson() {
        return [];
      },
      async readJson() {
        return "{}";
      },
      async createJson() {
        throw new Error("update");
      },
      async updateJson() {
        throw new Error("update");
      },
      async deleteJson() {},
    });
    await assert.rejects(
      () =>
        saveStoredBrief({
          kind: "quality",
          who: CHANCE,
          whoName: "Chance Middlebrooks",
          describe: "Must not look saved",
          files: [{ name: "ncr.pdf", type: "application/pdf", data: "JVBERi0x" }],
        }),
      /update/,
    );
  });
});
