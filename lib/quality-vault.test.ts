import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { QUALITY_BRIEFS_VAULT_KIND, QUALITY_BRIEFS_VAULT_NAME, qualityFolderId, readVaultJson } from "./drive-data.ts";
import { DRIVE_FOLDER_MIME, memoryDrive } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { saveQualityCompanyDocDrop } from "./quality-company-doc-drops.ts";
import { listQualityFolderDrops, listQualityVaultOwnerTree, saveQualityFolderDrop } from "./quality-folder-drops.ts";
import {
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_WRITE_ERROR,
  listQualityVaultFiles,
  mergeVaultedQualityFiles,
  persistQualityVaultFiles,
  qualityVaultPath,
  qualityVaultStored,
} from "./quality-vault.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-vault-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function pdf(name: string, text = name) {
  return { name, type: "application/pdf", data: Buffer.from(text).toString("base64") };
}

async function folderNames(drive: ReturnType<typeof memoryDrive>, parentId: string) {
  return (await drive.listChildren(parentId)).filter((row) => row.mimeType === DRIVE_FOLDER_MIME).map((row) => row.name);
}

async function child(drive: ReturnType<typeof memoryDrive>, parentId: string, name: string) {
  return (await drive.listChildren(parentId)).find((row) => row.name === name) ?? null;
}

describe("Quality vault persist", { concurrency: 1 }, () => {
  it("names company → site → job → folder and company-doc buckets at company level", () => {
    assert.deepEqual(
      qualityVaultPath({
        companyId: "madison",
        siteLabel: "Wood River",
        jobLabel: "Boiler 17",
        folderId: "welders",
      }),
      ["Madison", "Wood River", "Boiler 17", "Welders"],
    );
    assert.deepEqual(
      qualityVaultPath({
        companyId: "madison",
        folderId: "welds-nde",
        jobId: "job-b17",
        siteLabel: "Wood River",
        jobLabel: "Boiler 17",
      }),
      ["Madison", "Wood River", "Boiler 17", "Welds - NDE"],
    );
    assert.deepEqual(
      qualityVaultPath({
        companyId: "madison",
        folderId: "quality-control-manual",
        companyDocs: true,
      }),
      ["Madison", "Quality Control Manual"],
    );
    assert.equal(qualityVaultStored("drive", true), true);
    assert.equal(qualityVaultStored("server-json-file", true), false);
    assert.equal(qualityVaultStored("drive", false), false);
    assert.deepEqual(
      mergeVaultedQualityFiles([{ name: "stamp.pdf", type: "application/pdf" }], [
        { name: "stamp.pdf", type: "application/pdf", data: "QQ==" },
        { name: "local.pdf", type: "application/pdf", data: "Qg==" },
      ]).map((file) => `${file.name}:${file.vaulted}`),
      ["stamp.pdf:true", "local.pdf:false"],
    );
    assert.match(QUALITY_UNVAULTED_MARK, /on this desk only/);
  });

  it("writes the real file plus quality-briefs.json under the Quality room path", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "path"));
    useLeadBriefVaultForTests(drive);
    const saved = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      companyId: "madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      files: [pdf("stamp.pdf", "welder-stamp")],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.stored, true);
    assert.equal(saved.store, "drive");

    const root = qualityFolderId();
    assert.deepEqual(await folderNames(drive, root), ["Madison"]);
    const madison = await child(drive, root, "Madison");
    assert.ok(madison);
    const site = await child(drive, madison.id, "Wood River");
    assert.ok(site);
    const job = await child(drive, site.id, "Boiler 17");
    assert.ok(job);
    const folder = await child(drive, job.id, "Welders");
    assert.ok(folder);
    const file = await child(drive, folder.id, "stamp.pdf");
    assert.ok(file);
    assert.equal(new TextDecoder().decode(await drive.readBytes(file.id)), "welder-stamp");

    const index = await readVaultJson<{ briefs?: Array<{ files?: Array<{ name?: string; data?: string }> }> }>(
      drive,
      QUALITY_BRIEFS_VAULT_NAME,
      QUALITY_BRIEFS_VAULT_KIND,
      root,
    );
    assert.equal(index?.briefs?.[0]?.files?.[0]?.name, "stamp.pdf");
    assert.equal(index?.briefs?.[0]?.files?.[0]?.data, pdf("stamp.pdf", "welder-stamp").data);

    const listed = await listQualityFolderDrops(chance, "job-b17", "welders", "madison", {
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.equal(listed.stored, true);
    assert.equal(listed.store, "drive");
    assert.deepEqual(listed.files.map((file) => file.name), ["stamp.pdf"]);
    const vaulted = await listQualityVaultFiles(drive, {
      companyId: "madison",
      siteLabel: "Wood River",
      jobId: "job-b17",
      jobLabel: "Boiler 17",
      folderId: "welders",
      who: chance.email,
    });
    assert.equal(vaulted.stored, true);
    assert.deepEqual(vaulted.files.map((file) => file.name), ["stamp.pdf"]);
    const tree = await listQualityVaultOwnerTree(owner);
    assert.equal(tree.some((row) => row.path.join("/") === "Madison/Wood River/Boiler 17/Welders" && row.files.includes("stamp.pdf")), true);
  });

  it("writes company docs under the company bucket and lists them for the owner", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "docs"));
    useLeadBriefVaultForTests(drive);
    const saved = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("qc-manual.pdf", "manual")],
    });
    assert.equal(saved.ok, true);
    const madison = await child(drive, qualityFolderId(), "Madison");
    assert.ok(madison);
    const bucket = await child(drive, madison.id, "Quality Control Manual");
    assert.ok(bucket);
    const file = await child(drive, bucket.id, "qc-manual.pdf");
    assert.ok(file);
    assert.equal(new TextDecoder().decode(await drive.readBytes(file.id)), "manual");
    const ownerRows = await listStoredBriefs("quality", undefined, {
      jobId: "company-docs:madison",
      folderId: "quality-control-manual",
      companyId: "madison",
    });
    assert.equal(ownerRows.some((row) => row.who === chance.email), true);
  });

  it("fails closed when Drive is missing and does not advertise a local brief as saved", async () => {
    resetLeadBriefStoreForTests(join(dir, "none"));
    useLeadBriefVaultForTests(null);
    const failed = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      companyId: "madison",
      files: [pdf("stamp.pdf")],
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.error, QUALITY_VAULT_WRITE_ERROR);
    const leftover = await listStoredBriefs("quality", chance.email, { jobId: "job-b17", folderId: "welders" });
    assert.deepEqual(leftover, []);
  });

  it("fails closed when the file write is not confirmed", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "noconfirm"));
    const broken = {
      ...drive,
      configured: true,
      async uploadBytes() {
        return { id: "", name: "" };
      },
    };
    useLeadBriefVaultForTests(broken);
    await assert.rejects(
      () =>
        persistQualityVaultFiles(broken, { companyId: "madison", folderId: "welders", jobId: "job-b17" }, [
          pdf("stamp.pdf"),
        ]),
      /Quality vault/,
    );
    const failed = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "travelers",
      files: [pdf("traveler.pdf")],
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.match(failed.error, /Could not save/);
    assert.equal((await listStoredBriefs("quality", chance.email, { jobId: "job-b17", folderId: "travelers" })).length, 0);
    assert.equal(owner.role, "owner");
  });
});
