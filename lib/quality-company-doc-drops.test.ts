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
import { memoryDrive } from "./drive-estimates.ts";
import {
  listQualityCompanyDocDrop,
  listQualityCompanyDocDrops,
  qualityCompanyDocRowId,
  readQualityCompanyDocFile,
  saveQualityCompanyDocDrop,
} from "./quality-company-doc-drops.ts";
import { QUALITY_DROP_TYPE_ERROR } from "./quality-folder-drops.ts";
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
    await saveQualityCompanyDocDrop(wendell, {
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
});
