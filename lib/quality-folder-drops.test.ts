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
  resetLeadBriefStoreForTests,
  saveStoredBrief,
  useLeadBriefVaultForTests,
  type StoredLeadBrief,
} from "./lead-brief-store.ts";
import {
  QUALITY_DROP_TYPE_ERROR,
  listQualityFolderDrops,
  qualityDropLeaks,
  saveQualityFolderDrop,
  visibleQualityBriefsForTester,
} from "./quality-folder-drops.ts";
import { QUALITY_FOLDERS } from "./quality-folders.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-folders-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function pdf(name: string, text = name) {
  return { name, type: "application/pdf", data: Buffer.from(text).toString("base64") };
}

describe("Quality folder vault drops", { concurrency: 1 }, () => {
  it("saves into the selected folder, keeps prior files, and hides testers from each other", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "iso"));
    useLeadBriefVaultForTests(drive);

    const first = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      files: [pdf("stamp.pdf", "stamp-1")],
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.brief.folderId, "welders");
    assert.equal(first.brief.jobId, "job-b17");
    assert.deepEqual(
      first.brief.files.map((file) => file.name),
      ["stamp.pdf"],
    );

    const second = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      files: [pdf("card.pdf", "card")],
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.deepEqual(
      second.brief.files.map((file) => file.name).sort(),
      ["card.pdf", "stamp.pdf"],
    );

    await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "wps",
      files: [pdf("wps.pdf")],
    });
    await saveQualityFolderDrop(wendell, {
      jobId: "job-b17",
      folderId: "welders",
      files: [pdf("wendell.pdf")],
    });

    const chanceWelders = await listQualityFolderDrops(chance, "job-b17", "welders");
    const wendellWelders = await listQualityFolderDrops(wendell, "job-b17", "welders");
    const chanceWps = await listQualityFolderDrops(chance, "job-b17", "wps");
    const chanceOtherJob = await listQualityFolderDrops(chance, "job-other", "welders");
    assert.deepEqual(
      chanceWelders.files.map((file) => file.name).sort(),
      ["card.pdf", "stamp.pdf"],
    );
    assert.deepEqual(
      wendellWelders.files.map((file) => file.name),
      ["wendell.pdf"],
    );
    assert.deepEqual(
      chanceWps.files.map((file) => file.name),
      ["wps.pdf"],
    );
    assert.deepEqual(chanceOtherJob.files, []);
    assert.equal(
      chanceWelders.files.some((file) => file.name === "wendell.pdf"),
      false,
    );
    assert.equal(
      wendellWelders.files.some((file) => file.name === "stamp.pdf"),
      false,
    );

    const ownerList = await listQualityFolderDrops(owner, "job-b17", "welders");
    assert.equal(ownerList.files.some((file) => file.name === "stamp.pdf"), true);
    assert.equal(ownerList.files.some((file) => file.name === "wendell.pdf"), true);

    const vault = await readVaultJson<{ briefs?: StoredLeadBrief[] }>(
      drive,
      QUALITY_BRIEFS_VAULT_NAME,
      QUALITY_BRIEFS_VAULT_KIND,
    );
    const hidden = visibleQualityBriefsForTester(vault?.briefs ?? [], chance.email);
    assert.equal(hidden.every((row) => row.who === chance.email), true);
    assert.equal(qualityDropLeaks(chanceWelders), false);
    assert.equal(qualityDropLeaks({ file: QUALITY_BRIEFS_VAULT_NAME }), true);
    assert.equal(QUALITY_FOLDERS.length, 12);
    assert.equal(first.brief.companyId, undefined);
  });

  it("stamps Madison on the brief and does not open folders for another company", async () => {
    resetLeadBriefStoreForTests(join(dir, "company"));
    useLeadBriefVaultForTests(memoryDrive());
    const saved = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      companyId: "madison",
      files: [pdf("stamp.pdf")],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.brief.companyId, "madison");
    assert.equal(saved.brief.jobId, "job-b17");
    assert.equal(saved.brief.folderId, "welders");
    assert.equal(
      saved.brief.id,
      "brief-quality-chancec318@yahoo.com-job:job-b17-folder:welders",
    );

    const blocked = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      companyId: "hitsquad",
      files: [pdf("nope.pdf")],
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, "Pick a Quality folder.");

    await saveStoredBrief({
      kind: "quality",
      who: chance.email,
      whoName: chance.name,
      describe: "Welders",
      files: [pdf("legacy.pdf")],
      jobId: "job-legacy",
      folderId: "welders",
    });
    const legacy = await listStoredBriefs("quality", chance.email, {
      jobId: "job-legacy",
      folderId: "welders",
      companyId: "madison",
    });
    assert.deepEqual(
      legacy.map((row) => row.files[0]?.name),
      ["legacy.pdf"],
    );

    await saveStoredBrief({
      kind: "quality",
      who: chance.email,
      whoName: chance.name,
      describe: "Welders",
      files: [pdf("other-co.pdf")],
      jobId: "job-other-co",
      folderId: "welders",
      companyId: "acme",
    });
    const filtered = await listStoredBriefs("quality", chance.email, {
      jobId: "job-other-co",
      folderId: "welders",
      companyId: "madison",
    });
    assert.deepEqual(filtered, []);
    const listed = await listQualityFolderDrops(chance, "job-b17", "welders", "madison");
    assert.deepEqual(
      listed.files.map((file) => file.name),
      ["stamp.pdf"],
    );
    const hidden = await listQualityFolderDrops(chance, "job-b17", "welders", "hitsquad");
    assert.deepEqual(hidden.files, []);
  });

  it("rejects a blocked type and does not wipe the folder", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "reject"));
    useLeadBriefVaultForTests(drive);
    const kept = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "packages",
      files: [pdf("pack.pdf")],
    });
    assert.equal(kept.ok, true);
    const blocked = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "packages",
      files: [{ name: "trap.exe", type: "application/x-msdownload", data: "QQ==" }],
    });
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.error, QUALITY_DROP_TYPE_ERROR);
    const listed = await listQualityFolderDrops(chance, "job-b17", "packages");
    assert.deepEqual(
      listed.files.map((file) => file.name),
      ["pack.pdf"],
    );
  });

  it("does not look saved when the vault write fails", async () => {
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
    const failed = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "travelers",
      files: [pdf("traveler.pdf")],
    });
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.match(failed.error, /Could not save/);
    const leftover = await listStoredBriefs("quality", chance.email, { jobId: "job-b17", folderId: "travelers" });
    assert.equal(leftover[0]?.files[0]?.name, "traveler.pdf");
  });

  it("requires a job and a known folder before any write", async () => {
    resetLeadBriefStoreForTests(join(dir, "gate"));
    useLeadBriefVaultForTests(memoryDrive());
    const noJob = await saveQualityFolderDrop(chance, { folderId: "welders", files: [pdf("a.pdf")] });
    const noFolder = await saveQualityFolderDrop(chance, { jobId: "job-b17", files: [pdf("a.pdf")] });
    const invented = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "ncrs",
      files: [pdf("a.pdf")],
    });
    assert.equal(noJob.ok, false);
    assert.equal(noFolder.ok, false);
    assert.equal(invented.ok, false);
    if (!noJob.ok) assert.equal(noJob.error, "Pick a job.");
    if (!noFolder.ok) assert.equal(noFolder.error, "Pick a Quality folder.");
    if (!invented.ok) assert.equal(invented.error, "Pick a Quality folder.");
  });
});
