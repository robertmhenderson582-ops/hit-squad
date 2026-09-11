import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HSE_BRIEFS_VAULT_KIND,
  HSE_BRIEFS_VAULT_NAME,
  QUALITY_BRIEFS_VAULT_KIND,
  QUALITY_BRIEFS_VAULT_NAME,
  briefsFolderId,
  readVaultJson,
} from "./drive-data.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { HSE_VAULT_WRITE_ERROR } from "./lead-briefs.ts";
import {
  forgetLeadBriefCacheForTests,
  hseBriefsRequireDrive,
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

  it("HSE Save persists files to hse-briefs.json and strips bytes on the public row", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "hse"));
    useLeadBriefVaultForTests(drive);
    const saved = await saveStoredBrief({
      kind: "hse",
      who: CHANCE,
      whoName: "Chance Middlebrooks",
      describe: "Drop the JSA",
      files: [{ name: "jsa.pdf", type: "application/pdf", data: "JVBERi0x" }],
    });
    assert.equal(saved.kind, "hse");
    assert.equal(saved.files[0]?.name, "jsa.pdf");

    staleWarmLeadBriefInstanceForTests("hse");
    const mine = await listStoredBriefs("hse", CHANCE);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]?.files[0]?.name, "jsa.pdf");

    const vault = await readVaultJson<{ briefs?: StoredLeadBrief[] }>(drive, HSE_BRIEFS_VAULT_NAME, HSE_BRIEFS_VAULT_KIND);
    assert.equal(vault?.briefs?.[0]?.files[0]?.data, "JVBERi0x");
    assert.deepEqual(publicBrief(saved).files, [{ name: "jsa.pdf", type: "application/pdf" }]);
  });

  it("HSE Save fails closed when Drive is missing and does not look saved", async () => {
    resetLeadBriefStoreForTests(join(dir, "hse-missing"));
    useLeadBriefVaultForTests(null);
    assert.equal(hseBriefsRequireDrive(), false);
    await assert.rejects(
      () =>
        saveStoredBrief({
          kind: "hse",
          who: CHANCE,
          whoName: "Chance Middlebrooks",
          describe: "Must not look saved",
          files: [{ name: "jsa.pdf", type: "application/pdf", data: "JVBERi0x" }],
        }),
      (error: unknown) => error instanceof Error && error.message === HSE_VAULT_WRITE_ERROR,
    );
    assert.deepEqual(await listStoredBriefs("hse", CHANCE), []);
  });

  it("HSE Save fails closed when the Drive write throws and does not look saved", async () => {
    resetLeadBriefStoreForTests(join(dir, "hse-fail"));
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
          kind: "hse",
          who: CHANCE,
          whoName: "Chance Middlebrooks",
          describe: "Must not look saved",
          files: [{ name: "jsa.pdf", type: "application/pdf", data: "JVBERi0x" }],
        }),
      /update/,
    );
    assert.deepEqual(await listStoredBriefs("hse", CHANCE), []);
  });

  it("prefers the configured HSE room for hse-briefs.json", () => {
    const prev = process.env.DRIVE_HSE_FOLDER_ID;
    process.env.DRIVE_HSE_FOLDER_ID = "hse-room-test";
    try {
      assert.equal(briefsFolderId("hse"), "hse-room-test");
    } finally {
      if (prev == null) delete process.env.DRIVE_HSE_FOLDER_ID;
      else process.env.DRIVE_HSE_FOLDER_ID = prev;
    }
  });

  it("LeadStudio and briefs API do not claim Saved without a confirmed HSE vault write", () => {
    const studio = readFileSync(fileURLToPath(new URL("../components/LeadStudio.tsx", import.meta.url)), "utf8");
    const route = readFileSync(fileURLToPath(new URL("../app/api/desk/briefs/route.ts", import.meta.url)), "utf8");
    assert.match(studio, /HSE_VAULT_WRITE_ERROR/);
    assert.match(studio, /!response\.ok \|\| !saved\?\.savedAt/);
    assert.match(route, /HSE_VAULT_WRITE_ERROR/);
    assert.match(route, /status: 503/);
    assert.doesNotMatch(studio, /1KKpYqirYrJo99faLufX5wLLayG8u3UUN|hse-briefs\.json/);
    assert.doesNotMatch(route, /1KKpYqirYrJo99faLufX5wLLayG8u3UUN/);
  });
});
