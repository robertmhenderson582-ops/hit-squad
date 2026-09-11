import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { QUALITY_BRIEFS_VAULT_KIND, QUALITY_BRIEFS_VAULT_NAME, QUALITY_CONTROL_MANUAL_FILE_ID, qualityFolderId, readVaultJson } from "./drive-data.ts";
import { DRIVE_FOLDER_MIME, DriveApiError, memoryDrive } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { saveQualityCompanyDocDrop } from "./quality-company-doc-drops.ts";
import { listQualityFolderDrops, listQualityVaultOwnerTree, saveQualityFolderDrop } from "./quality-folder-drops.ts";
import { qualityDropLeaks } from "./quality-vault-shared.ts";
import {
  QUALITY_LIBRARY_LOCK_NAME,
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_ERROR,
  listQualityCompanyDocVaultFolders,
  isProtectedQualityCompanyDocFile,
  listQualityVaultFiles,
  mergeVaultedQualityFiles,
  persistQualityVaultFiles,
  qualityVaultPath,
  qualityVaultStored,
  qualityVaultWriteUserError,
  readQualityVaultFile,
  trashQualityVaultFile,
  writeQualityCompanyDocLock,
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
    assert.deepEqual(
      qualityVaultPath({
        companyId: "madison",
        folderId: "packages",
        jobId: "quality-ready-shelf:day-1-kit",
        jobLabel: "Day-1 kit",
        shelf: true,
      }),
      ["Madison", "Ready Quality packages", "Day-1 kit"],
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
    const opened = await readQualityVaultFile(
      drive,
      { companyId: "madison", folderId: "quality-control-manual", jobId: "company-docs:madison", companyDocs: true },
      "qc-manual.pdf",
    );
    assert.equal(opened.file?.name, "qc-manual.pdf");
    assert.equal(opened.file?.type, "application/pdf");
    assert.equal(opened.file?.data, pdf("qc-manual.pdf", "manual").data);
    assert.equal("id" in (opened.file || {}), false);
    assert.equal(qualityDropLeaks(opened), false);
    const ownerRows = await listStoredBriefs("quality", undefined, {
      jobId: "company-docs:madison",
      folderId: "quality-control-manual",
      companyId: "madison",
    });
    assert.equal(ownerRows.some((row) => row.who === chance.email), true);

    const mislabeled = await persistQualityVaultFiles(
      drive,
      { companyId: "madison", folderId: "code-documents", jobId: "company-docs:madison", companyDocs: true },
      [{ name: "x.pdf", type: "text/plain", data: Buffer.from("%PDF-1.4 codes").toString("base64") }],
    );
    assert.equal(mislabeled.store, "drive");
    const openedPlain = await readQualityVaultFile(
      drive,
      { companyId: "madison", folderId: "code-documents", jobId: "company-docs:madison", companyDocs: true },
      "x.pdf",
    );
    assert.equal(openedPlain.file?.type, "application/pdf");
    const buckets = await listQualityCompanyDocVaultFolders(drive, { companyId: "madison" });
    assert.equal(buckets.stored, true);
    assert.equal(buckets.filesByFolder["quality-control-manual"]?.some((file) => file.name === "qc-manual.pdf"), true);
    assert.equal(buckets.filesByFolder["code-documents"]?.some((file) => file.name === "x.pdf" && file.type === "application/pdf"), true);
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

  it("keeps testers on the vault write error and gives the owner a 403/404 share diagnostic", async () => {
    const leaked = new DriveApiError(
      403,
      "The user does not have sufficient permissions for this file. hitsquad-vault@hit-squad-vault.iam.gserviceaccount.com 1A7anV1UKx8m7IgUW2uVpwWHxB5fHerOg",
      "service-account",
    );
    assert.equal(qualityVaultWriteUserError(leaked, false), QUALITY_VAULT_WRITE_ERROR);
    assert.equal(qualityVaultWriteUserError(leaked, true), QUALITY_VAULT_SHARE_ERROR);
    assert.equal(qualityVaultWriteUserError(new DriveApiError(404, "folder 1A7anV1UKx8m7IgUW2uVpwWHxB5fHerOg"), true), QUALITY_VAULT_MISSING_ERROR);
    assert.equal(qualityDropLeaks(QUALITY_VAULT_WRITE_ERROR), false);
    assert.equal(qualityDropLeaks(QUALITY_VAULT_SHARE_ERROR), false);
    assert.equal(qualityDropLeaks(QUALITY_VAULT_MISSING_ERROR), false);
    assert.equal(qualityDropLeaks(leaked.message), true);

    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "acl"));
    const denied = {
      ...drive,
      configured: true,
      async createFolder() {
        throw leaked;
      },
      async uploadBytes() {
        throw leaked;
      },
    };
    useLeadBriefVaultForTests(denied);
    const tester = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "welders",
      companyId: "madison",
      files: [pdf("stamp.pdf")],
    });
    const ownerDenied = await saveQualityFolderDrop(owner, {
      jobId: "job-b17",
      folderId: "welders",
      companyId: "madison",
      files: [pdf("stamp.pdf")],
    });
    assert.equal(tester.ok, false);
    assert.equal(ownerDenied.ok, false);
    if (!tester.ok) {
      assert.equal(tester.error, QUALITY_VAULT_WRITE_ERROR);
      assert.equal(qualityDropLeaks(tester), false);
    }
    if (!ownerDenied.ok) {
      assert.equal(ownerDenied.error, QUALITY_VAULT_SHARE_ERROR);
      assert.equal(qualityDropLeaks(ownerDenied), false);
    }
    assert.equal((await listStoredBriefs("quality", chance.email, { jobId: "job-b17", folderId: "welders" })).length, 0);
    assert.equal((await listStoredBriefs("quality", owner.email, { jobId: "job-b17", folderId: "welders" })).length, 0);

    const missing = {
      ...drive,
      configured: true,
      async createFolder() {
        throw new DriveApiError(404, "not found 1A7anV1UKx8m7IgUW2uVpwWHxB5fHerOg");
      },
    };
    useLeadBriefVaultForTests(missing);
    const ownerMissing = await saveQualityFolderDrop(owner, {
      jobId: "job-b17",
      folderId: "travelers",
      companyId: "madison",
      files: [pdf("traveler.pdf")],
    });
    const testerMissing = await saveQualityFolderDrop(chance, {
      jobId: "job-b17",
      folderId: "travelers",
      companyId: "madison",
      files: [pdf("traveler.pdf")],
    });
    assert.equal(ownerMissing.ok, false);
    assert.equal(testerMissing.ok, false);
    if (!ownerMissing.ok) {
      assert.equal(ownerMissing.error, QUALITY_VAULT_MISSING_ERROR);
      assert.equal(qualityDropLeaks(ownerMissing), false);
    }
    if (!testerMissing.ok) assert.equal(testerMissing.error, QUALITY_VAULT_WRITE_ERROR);
  });

  it("trashes a company-doc file and stamps a per-bar lock without listing the lock as a file", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "trash"));
    useLeadBriefVaultForTests(drive);
    const place = {
      companyId: "madison",
      folderId: "quality-control-manual",
      jobId: "company-docs:madison",
      companyDocs: true as const,
    };
    await persistQualityVaultFiles(drive, place, [pdf("qc-manual.pdf", "manual")]);
    const locked = await writeQualityCompanyDocLock(drive, place, true, owner.email);
    assert.equal(locked.locked, true);
    const listed = await listQualityVaultFiles(drive, place);
    assert.equal(listed.locked, true);
    assert.deepEqual(listed.files.map((file) => file.name), ["qc-manual.pdf"]);
    assert.equal(listed.files.some((file) => file.name === QUALITY_LIBRARY_LOCK_NAME), false);
    const folders = await listQualityCompanyDocVaultFolders(drive, { companyId: "madison" });
    assert.equal(folders.locksByFolder["quality-control-manual"], true);
    assert.equal(folders.filesByFolder["quality-control-manual"]?.some((file) => file.name === "qc-manual.pdf"), true);
    await trashQualityVaultFile(drive, place, "qc-manual.pdf");
    const after = await listQualityVaultFiles(drive, place);
    assert.deepEqual(after.files, []);
    assert.equal(after.locked, true);
    await writeQualityCompanyDocLock(drive, place, false, owner.email);
    assert.equal((await listQualityVaultFiles(drive, place)).locked, false);
  });

  it("trashes extra Control Manual copies and leaves the company PDF", async () => {
    const drive = memoryDrive();
    const place = {
      companyId: "madison",
      folderId: "quality-control-manual",
      jobId: "company-docs:madison",
      companyDocs: true as const,
    };
    await persistQualityVaultFiles(drive, place, [pdf("Quality Control Manual.pdf", "official")]);
    const bucket = [...drive.tree.values()].find(
      (row) => row.file.name === "Quality Control Manual" && row.file.mimeType === DRIVE_FOLDER_MIME,
    );
    const uploaded = [...drive.tree.values()].find(
      (row) => row.file.name === "Quality Control Manual.pdf" && row.file.parents?.includes(bucket?.file.id || ""),
    );
    assert.ok(uploaded);
    drive.tree.delete(uploaded.file.id);
    drive.tree.set(QUALITY_CONTROL_MANUAL_FILE_ID, {
      file: { ...uploaded.file, id: QUALITY_CONTROL_MANUAL_FILE_ID },
      bytes: uploaded.bytes,
    });
    drive.tree.set("chance-copy", {
      file: {
        id: "chance-copy",
        name: "Quality Control Manual.pdf",
        mimeType: "application/pdf",
        parents: bucket?.file.id ? [bucket.file.id] : [],
      },
      bytes: new Uint8Array([4, 5, 6]),
    });
    assert.equal(isProtectedQualityCompanyDocFile(QUALITY_CONTROL_MANUAL_FILE_ID), true);
    const trashed = await trashQualityVaultFile(drive, place, "Quality Control Manual.pdf");
    assert.equal(trashed.trashed, 1);
    assert.equal(trashed.protectedKept, true);
    assert.equal(drive.tree.has(QUALITY_CONTROL_MANUAL_FILE_ID), true);
    assert.equal(drive.tree.has("chance-copy"), false);
    const listed = await listQualityVaultFiles(drive, place);
    assert.equal(listed.files.some((file) => file.name === "Quality Control Manual.pdf" && file.protected), true);
    assert.equal(qualityDropLeaks(listed), false);
    assert.deepEqual(
      mergeVaultedQualityFiles(
        [
          { name: "Quality Control Manual.pdf", type: "application/pdf", protected: true },
          { name: "Quality Control Manual.pdf", type: "application/pdf" },
        ],
        [],
      ).map((file) => `${file.name}:${file.protected ? "keep" : "drop"}`),
      ["Quality Control Manual.pdf:drop"],
    );
  });
});
