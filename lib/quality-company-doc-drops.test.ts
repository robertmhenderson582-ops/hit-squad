import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { DRIVE_FOLDER_MIME, memoryDrive } from "./drive-estimates.ts";
import {
  QUALITY_COMPANY_DOC_EDIT_ERROR,
  QUALITY_COMPANY_DOC_KEEP_ERROR,
  QUALITY_COMPANY_DOC_LOCK_ERROR,
  QUALITY_COMPANY_DOC_LOCKED_NOTE,
  listQualityCompanyDocDrop,
  listQualityCompanyDocDrops,
  lockQualityCompanyDoc,
  qualityCompanyDocRowId,
  readQualityCompanyDocFile,
  removeQualityCompanyDocFile,
  saveQualityCompanyDocDrop,
} from "./quality-company-doc-drops.ts";
import { QUALITY_DROP_TYPE_ERROR } from "./quality-folder-drops.ts";
import { QUALITY_CONTROL_MANUAL_FILE_ID } from "./drive-data.ts";
import { QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR, qualityCompanyDocsJobId } from "./quality-company-docs.ts";
import { persistQualityVaultFiles } from "./quality-vault.ts";
import { qualityDropLeaks } from "./quality-vault-shared.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const dir = mkdtempSync(join(tmpdir(), "hs-quality-docs-"));
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

describe("Quality company document vault drops", { concurrency: 1 }, () => {
  it("saves into a standing company file and does not mix testers or job folders", async () => {
    resetLeadBriefStoreForTests(join(dir, "iso"));
    useLeadBriefVaultForTests(memoryDrive());

    const first = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("qc-manual.pdf")],
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.brief.folderId, "quality-control-manual");
    assert.equal(first.brief.companyId, "madison");
    assert.equal(first.brief.jobId, "company-docs:madison");
    assert.equal(
      first.brief.id,
      qualityCompanyDocRowId(chance.email, "madison", "quality-control-manual"),
    );

    await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "forms",
      files: [pdf("form.pdf")],
    });
    const blockedWendell = await saveQualityCompanyDocDrop(wendell, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("wendell.pdf")],
    });
    assert.equal(blockedWendell.ok, false);
    if (!blockedWendell.ok) assert.equal(blockedWendell.error, QUALITY_COMPANY_DOC_EDIT_ERROR);
    await saveQualityCompanyDocDrop(owner, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("wendell.pdf")],
    });

    const chanceManual = await listQualityCompanyDocDrop(chance, "quality-control-manual", "madison");
    const chanceForms = await listQualityCompanyDocDrop(chance, "forms", "madison");
    const wendellManual = await listQualityCompanyDocDrop(wendell, "quality-control-manual", "madison");
    assert.equal(chanceManual.files.some((file) => file.name === "qc-manual.pdf"), true);
    assert.equal(chanceManual.files.some((file) => file.name === "wendell.pdf"), true);
    assert.deepEqual(
      chanceForms.files.map((file) => file.name),
      ["form.pdf"],
    );
    assert.deepEqual(
      wendellManual.files.map((file) => file.name).sort(),
      ["qc-manual.pdf", "wendell.pdf"],
    );

    const ownerList = await listQualityCompanyDocDrops(owner, "madison");
    assert.equal(ownerList.filesByFolder["quality-control-manual"]?.some((file) => file.name === "qc-manual.pdf"), true);
    assert.equal(ownerList.filesByFolder["quality-control-manual"]?.some((file) => file.name === "wendell.pdf"), true);

    const jobRows = await listStoredBriefs("quality", chance.email, { jobId: "job-b17", folderId: "welders" });
    assert.equal(jobRows.length, 0);
    assert.equal(qualityCompanyDocsJobId("madison").startsWith("company-docs:"), true);
  });

  it("rejects a blocked type and an unknown bucket", async () => {
    resetLeadBriefStoreForTests(join(dir, "reject"));
    useLeadBriefVaultForTests(memoryDrive());
    const blocked = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "forms",
      files: [{ name: "trap.exe", type: "application/x-msdownload", data: "QQ==" }],
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, QUALITY_DROP_TYPE_ERROR);
    const invented = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "welders",
      files: [pdf("nope.pdf")],
    });
    assert.equal(invented.ok, false);
  });

  it("opens a company-doc file for Chance without leaking Drive ids", async () => {
    resetLeadBriefStoreForTests(join(dir, "view"));
    useLeadBriefVaultForTests(memoryDrive());
    const saved = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("qc-manual.pdf", "madison-manual")],
    });
    assert.equal(saved.ok, true);
    const opened = await readQualityCompanyDocFile(chance, "quality-control-manual", "qc-manual.pdf", "madison");
    assert.equal(opened.file?.name, "qc-manual.pdf");
    assert.equal(opened.file?.data, pdf("qc-manual.pdf", "madison-manual").data);
    assert.equal(opened.store, "drive");
    assert.equal(qualityDropLeaks(opened), false);
    assert.equal("id" in (opened.file || {}), false);
    const missing = await readQualityCompanyDocFile(chance, "quality-control-manual", "missing.pdf", "madison");
    assert.equal(missing.file, null);
    const wood = await listQualityCompanyDocDrops(chance, "madison");
    const rodeo = await listQualityCompanyDocDrops(wendell, "madison");
    assert.deepEqual(
      wood.filesByFolder["quality-control-manual"]?.map((file) => file.name),
      rodeo.filesByFolder["quality-control-manual"]?.map((file) => file.name),
    );
    assert.equal(wood.companyId, "madison");
    assert.equal(rodeo.companyId, "madison");
  });

  it("opens a vault PDF whose Drive type is text/plain as application/pdf", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "pdf-mime"));
    useLeadBriefVaultForTests(drive);
    await persistQualityVaultFiles(
      drive,
      { companyId: "madison", folderId: "code-documents", jobId: "company-docs:madison", companyDocs: true },
      [{ name: "x.pdf", type: "text/plain", data: Buffer.from("%PDF-1.4 codes").toString("base64") }],
    );
    const opened = await readQualityCompanyDocFile(chance, "code-documents", "x.pdf", "madison");
    assert.equal(opened.file?.name, "x.pdf");
    assert.equal(opened.file?.type, "application/pdf");
    assert.equal(opened.file?.data, Buffer.from("%PDF-1.4 codes").toString("base64"));
    const listed = await listQualityCompanyDocDrop(chance, "code-documents", "madison");
    assert.equal(listed.files.find((file) => file.name === "x.pdf")?.type, "application/pdf");
  });

  it("rejects a Google Doc named like a PDF instead of previewing it as text", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "gdoc"));
    useLeadBriefVaultForTests(drive);
    await persistQualityVaultFiles(
      drive,
      { companyId: "madison", folderId: "quality-control-manual", jobId: "company-docs:madison", companyDocs: true },
      [{ name: "qc-manual.pdf", type: "application/vnd.google-apps.document", data: Buffer.from("not-pdf").toString("base64") }],
    );
    const opened = await readQualityCompanyDocFile(chance, "quality-control-manual", "qc-manual.pdf", "madison");
    assert.equal(opened.file, null);
    assert.equal(opened.error, QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR);
    assert.match(source("../app/api/desk/briefs/route.ts"), /listed\.error \? 415 : 404/);
  });

  it("lists the four company-doc buckets with one company walk, not four stacked walks", async () => {
    const drive = memoryDrive();
    let lists = 0;
    const wrapped = {
      ...drive,
      async listChildren(parentId: string) {
        lists += 1;
        return drive.listChildren(parentId);
      },
    };
    resetLeadBriefStoreForTests(join(dir, "parallel"));
    useLeadBriefVaultForTests(wrapped);
    for (const folderId of ["quality-control-manual", "code-documents", "forms", "quality-updates"] as const) {
      const saved = await saveQualityCompanyDocDrop(chance, {
        companyId: "madison",
        folderId,
        files: [pdf(`${folderId}.pdf`)],
      });
      assert.equal(saved.ok, true);
    }
    lists = 0;
    const listed = await listQualityCompanyDocDrops(owner, "madison");
    assert.equal(listed.filesByFolder["quality-control-manual"]?.some((file) => file.name === "quality-control-manual.pdf"), true);
    assert.equal(listed.filesByFolder["code-documents"]?.some((file) => file.name === "code-documents.pdf"), true);
    assert.equal(listed.filesByFolder["forms"]?.some((file) => file.name === "forms.pdf"), true);
    assert.equal(listed.filesByFolder["quality-updates"]?.some((file) => file.name === "quality-updates.pdf"), true);
    assert.ok(lists <= 6, `expected a shared company walk, got ${lists} listChildren calls`);
    const drops = source("./quality-company-doc-drops.ts");
    assert.match(drops, /listQualityCompanyDocVaultFolders/);
    assert.match(drops, /Promise\.all/);
    assert.doesNotMatch(drops, /for \(const folder of folders\) \{\s*const listed = await listQualityCompanyDocDrop/);
  });

  it("lets Chance add and remove until Owner locks the bar", async () => {
    resetLeadBriefStoreForTests(join(dir, "acl"));
    useLeadBriefVaultForTests(memoryDrive());
    const saved = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "forms",
      files: [pdf("form.pdf")],
    });
    assert.equal(saved.ok, true);
    const lockedByChance = await lockQualityCompanyDoc(chance, {
      companyId: "madison",
      folderId: "forms",
      locked: true,
    });
    assert.equal(lockedByChance.ok, false);
    if (!lockedByChance.ok) assert.equal(lockedByChance.error, QUALITY_COMPANY_DOC_LOCK_ERROR);

    const locked = await lockQualityCompanyDoc(owner, {
      companyId: "madison",
      folderId: "forms",
      locked: true,
    });
    assert.equal(locked.ok, true);
    if (locked.ok) assert.equal(locked.locked, true);

    const dropped = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "forms",
      files: [pdf("late.pdf")],
    });
    assert.equal(dropped.ok, false);
    if (!dropped.ok) assert.equal(dropped.error, QUALITY_COMPANY_DOC_LOCKED_NOTE);

    const removed = await removeQualityCompanyDocFile(chance, {
      companyId: "madison",
      folderId: "forms",
      fileName: "form.pdf",
    });
    assert.equal(removed.ok, false);
    if (!removed.ok) assert.equal(removed.error, QUALITY_COMPANY_DOC_LOCKED_NOTE);

    const ownerDrop = await saveQualityCompanyDocDrop(owner, {
      companyId: "madison",
      folderId: "forms",
      files: [pdf("owner.pdf")],
    });
    assert.equal(ownerDrop.ok, true);

    const unlocked = await lockQualityCompanyDoc(owner, {
      companyId: "madison",
      folderId: "forms",
      locked: false,
    });
    assert.equal(unlocked.ok, true);

    const cleared = await removeQualityCompanyDocFile(chance, {
      companyId: "madison",
      folderId: "forms",
      fileName: "form.pdf",
    });
    assert.equal(cleared.ok, true);
    const listed = await listQualityCompanyDocDrop(chance, "forms", "madison");
    assert.equal(listed.files.some((file) => file.name === "form.pdf"), false);
    assert.equal(listed.files.some((file) => file.name === "owner.pdf"), true);
    assert.equal(listed.locked, false);
    assert.equal(
      (await listQualityCompanyDocDrops(owner, "madison")).locksByFolder.forms,
      false,
    );
    const viewer = await saveQualityCompanyDocDrop(wendell, {
      companyId: "madison",
      folderId: "forms",
      files: [pdf("nope.pdf")],
    });
    assert.equal(viewer.ok, false);
    if (!viewer.ok) assert.equal(viewer.error, QUALITY_COMPANY_DOC_EDIT_ERROR);
    const route = source("../app/api/desk/briefs/route.ts");
    assert.match(route, /removeQualityCompanyDocFile/);
    assert.match(route, /lockQualityCompanyDoc/);
    assert.match(route, /export async function DELETE/);
  });

  it("fails closed when lock state cannot be read", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "lock-fail"));
    useLeadBriefVaultForTests({
      ...drive,
      configured: true,
      async listChildren() {
        throw new Error("drive down");
      },
    });
    const dropped = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "code-documents",
      files: [pdf("code.pdf")],
    });
    assert.equal(dropped.ok, false);
    if (!dropped.ok) assert.equal(dropped.error, QUALITY_COMPANY_DOC_LOCKED_NOTE);
    const listed = await listQualityCompanyDocDrops(chance, "madison");
    assert.equal(listed.locksKnown, false);
    assert.equal(listed.locksByFolder["code-documents"], true);
  });

  it("lets Chance remove extra Control Manual drops and keeps the company manual", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "manual-keep"));
    useLeadBriefVaultForTests(drive);
    const place = {
      companyId: "madison",
      folderId: "quality-control-manual" as const,
      jobId: "company-docs:madison",
      companyDocs: true as const,
    };
    await persistQualityVaultFiles(drive, place, [pdf("Quality Control Manual.pdf", "official-manual")]);
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

    const saved = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("chance-drop.pdf", "chance-notes")],
    });
    assert.equal(saved.ok, true);
    const viewerBlocked = await removeQualityCompanyDocFile(wendell, {
      companyId: "madison",
      folderId: "quality-control-manual",
      fileName: "chance-drop.pdf",
    });
    assert.equal(viewerBlocked.ok, false);
    if (!viewerBlocked.ok) assert.equal(viewerBlocked.error, QUALITY_COMPANY_DOC_EDIT_ERROR);

    const locked = await lockQualityCompanyDoc(owner, {
      companyId: "madison",
      folderId: "quality-control-manual",
      locked: true,
    });
    assert.equal(locked.ok, true);
    const lockedRemove = await removeQualityCompanyDocFile(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      fileName: "chance-drop.pdf",
    });
    assert.equal(lockedRemove.ok, false);
    if (!lockedRemove.ok) assert.equal(lockedRemove.error, QUALITY_COMPANY_DOC_LOCKED_NOTE);
    const unlocked = await lockQualityCompanyDoc(owner, {
      companyId: "madison",
      folderId: "quality-control-manual",
      locked: false,
    });
    assert.equal(unlocked.ok, true);

    const cleared = await removeQualityCompanyDocFile(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      fileName: "chance-drop.pdf",
    });
    assert.equal(cleared.ok, true);
    if (cleared.ok) {
      assert.equal(cleared.files.some((file) => file.name === "chance-drop.pdf"), false);
      assert.equal(cleared.files.some((file) => file.name === "Quality Control Manual.pdf" && file.protected), true);
      assert.equal(qualityDropLeaks(cleared), false);
    }

    drive.tree.set("chance-copy", {
      file: {
        id: "chance-copy",
        name: "Quality Control Manual.pdf",
        mimeType: "application/pdf",
        parents: bucket?.file.id ? [bucket.file.id] : [],
      },
      bytes: new Uint8Array([9, 9, 9]),
    });
    const extras = await removeQualityCompanyDocFile(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      fileName: "Quality Control Manual.pdf",
    });
    assert.equal(extras.ok, true);
    assert.equal(drive.tree.has(QUALITY_CONTROL_MANUAL_FILE_ID), true);
    assert.equal(drive.tree.has("chance-copy"), false);

    const keep = await removeQualityCompanyDocFile(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      fileName: "Quality Control Manual.pdf",
    });
    assert.equal(keep.ok, false);
    if (!keep.ok) assert.equal(keep.error, QUALITY_COMPANY_DOC_KEEP_ERROR);
    assert.equal(drive.tree.has(QUALITY_CONTROL_MANUAL_FILE_ID), true);
    const listed = await listQualityCompanyDocDrop(chance, "quality-control-manual", "madison");
    assert.equal(listed.files.some((file) => file.name === "Quality Control Manual.pdf" && file.protected), true);
    assert.equal(qualityDropLeaks(listed), false);
    assert.equal(qualityDropLeaks(keep), false);
  });
});
