import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { inferCompanyIdFromParts } from "./companies.ts";
import {
  QUALITY_COMPANY_DOCS,
  QUALITY_COMPANY_DOC_CATALOG,
  QUALITY_COMPANY_DOC_TEMPLATES,
  cloneQualityCompanyDocTemplate,
  isQualityCompanyDocId,
  QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  primaryQualityCompanyDocFile,
  publicQualityCompanyDocFile,
  qualityCompanyDocCollidesWithJobFolder,
  qualityCompanyDocGoogleNativeType,
  qualityCompanyDocHome,
  qualityCompanyDocLabel,
  qualityCompanyDocPreviewType,
  qualityCompanyDocViewKind,
  qualityCompanyDocViewPath,
  qualityCompanyDocsFor,
  qualityCompanyDocsJobId,
  qualityCompanyDocsListedFor,
  qualityRailCompanyId,
  readQualityCompanyDocFiles,
  readQualityCompanyDocPick,
  showsQualityCompanyDocs,
  writeQualityCompanyDocFiles,
  writeQualityCompanyDocPick,
} from "./quality-company-docs.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("Quality company document catalog", () => {
  it("locks Chance’s four standing file labels and stays company-portable", () => {
    assert.deepEqual(
      QUALITY_COMPANY_DOCS.map((doc) => doc.label),
      ["Quality Control Manual", "Code Documents", "Forms", "Quality Updates"],
    );
    assert.equal(QUALITY_COMPANY_DOCS.length, 4);
    assert.deepEqual(
      qualityCompanyDocsFor("madison").map((doc) => doc.label),
      QUALITY_COMPANY_DOCS.map((doc) => doc.label),
    );
    assert.deepEqual(qualityCompanyDocsFor("hitsquad"), []);
    assert.deepEqual(qualityCompanyDocsFor("acme"), []);
    assert.equal(showsQualityCompanyDocs("madison"), true);
    assert.equal(showsQualityCompanyDocs("hitsquad"), false);
    assert.deepEqual(
      qualityCompanyDocsListedFor("hitsquad").map((doc) => doc.label),
      QUALITY_COMPANY_DOCS.map((doc) => doc.label),
    );
    assert.equal(qualityCompanyDocHome("hitsquad"), "madison");
    assert.equal(qualityCompanyDocHome("madison"), "madison");
    assert.equal(qualityRailCompanyId("", "hitsquad"), "madison");
    assert.equal(qualityRailCompanyId("madison", "hitsquad"), "madison");
    assert.equal(qualityRailCompanyId("acme", "hitsquad"), "madison");
    assert.equal(qualityCompanyDocsJobId("madison"), "company-docs:madison");
    assert.equal(isQualityCompanyDocId("quality-control-manual"), true);
    assert.equal(isQualityCompanyDocId("welders"), false);
    assert.equal(qualityCompanyDocCollidesWithJobFolder("forms"), false);
    assert.equal(qualityCompanyDocLabel("forms"), "Forms");
    assert.deepEqual(
      QUALITY_COMPANY_DOC_TEMPLATES.filter((row) => row.live).map((row) => row.companyId),
      ["madison"],
    );
    const cloned = cloneQualityCompanyDocTemplate("acme");
    assert.equal(cloned.companyId, "acme");
    assert.equal(cloned.live, false);
    assert.deepEqual(
      cloned.docs.map((doc) => doc.id),
      QUALITY_COMPANY_DOC_CATALOG.map((doc) => doc.id),
    );
    assert.equal(showsQualityCompanyDocs("acme"), false);
  });

  it("keeps company-doc files off the job folder keys", () => {
    const store = memoryStore();
    writeQualityCompanyDocPick("madison", "forms", store);
    assert.equal(readQualityCompanyDocPick("madison", store), "forms");
    writeQualityCompanyDocFiles(
      "madison",
      "forms",
      [{ name: "2.7.19.pdf", type: "application/pdf", data: "JVBERi0x" }],
      store,
    );
    writeQualityCompanyDocFiles(
      "madison",
      "code-documents",
      [{ name: "code.pdf", type: "application/pdf", data: "JVBERi0x" }],
      store,
    );
    assert.deepEqual(
      readQualityCompanyDocFiles("madison", "forms", store).map((file) => file.name),
      ["2.7.19.pdf"],
    );
    assert.deepEqual(
      readQualityCompanyDocFiles("madison", "code-documents", store).map((file) => file.name),
      ["code.pdf"],
    );
  });

  it("fails if Quality no longer keeps the left rail always on and the job folders after a job", () => {
    const quality = source("../components/QualityDesk.tsx");
    const rail = source("../components/QualityCompanyDocRail.tsx");
    assert.match(quality, /QualityCompanyDocRail/);
    assert.match(quality, /JobScopePicks/);
    assert.match(quality, /QualityFolderDrop/);
    const railIndex = quality.indexOf("<QualityCompanyDocRail");
    const jobOpenIndex = quality.indexOf("{jobOpen ?");
    const dropIndex = quality.indexOf("<QualityFolderDrop");
    const tabsIndex = quality.indexOf('role="tablist"');
    assert.equal(railIndex >= 0 && railIndex < jobOpenIndex, true);
    assert.equal(dropIndex > jobOpenIndex && tabsIndex > dropIndex, true);
    assert.match(rail, /quality-company-docs/);
    assert.match(rail, /onDrop/);
    assert.match(rail, /type="file"/);
    assert.match(rail, /doc\.label/);
    assert.match(rail, /openLibrary/);
    assert.match(rail, /QualityCompanyDocViewer/);
    assert.match(rail, /Drop a file on a bar/);
    assert.match(rail, /QUALITY_COMPANY_DOC_LOCKED_NOTE/);
    assert.match(rail, /action: "lock"/);
    assert.match(rail, /canRemove/);
    assert.match(rail, /Remove a file there, then confirm/);
    assert.match(quality, /qualityRailCompanyId\(undefined, assignedCompanyId/);
    assert.doesNotMatch(rail, /drive\.google\.com|1[A-Za-z0-9_-]{20,}/);
    const catalog = source("./quality-company-docs.ts");
    for (const label of QUALITY_COMPANY_DOCS.map((doc) => doc.label)) {
      assert.match(catalog, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("keeps Chance’s Madison home when he switches Wood River vs Rodeo", () => {
    const assigned = "hitsquad";
    const wood = inferCompanyIdFromParts("Phillips 66", "Wood River", "Boiler 17");
    const rodeo = inferCompanyIdFromParts("Phillips 66", "Rodeo", "Turnaround");
    assert.equal(wood, "madison");
    assert.equal(rodeo, "madison");
    assert.equal(qualityRailCompanyId(wood, assigned), "madison");
    assert.equal(qualityRailCompanyId(rodeo, assigned), "madison");
    assert.equal(
      qualityCompanyDocsJobId(qualityRailCompanyId(wood, assigned)),
      qualityCompanyDocsJobId(qualityRailCompanyId(rodeo, assigned)),
    );
    assert.equal(qualityCompanyDocsJobId(qualityRailCompanyId(wood, assigned)), "company-docs:madison");
    assert.deepEqual(
      qualityCompanyDocsListedFor(qualityRailCompanyId(wood, assigned)).map((doc) => doc.label),
      qualityCompanyDocsListedFor(qualityRailCompanyId(rodeo, assigned)).map((doc) => doc.label),
    );
  });

  it("picks the latest vaulted file and classifies open/view kinds", () => {
    assert.equal(qualityCompanyDocViewKind({ name: "qc-manual.pdf", type: "application/pdf" }), "pdf");
    assert.equal(qualityCompanyDocViewKind({ name: "stamp.png", type: "image/png" }), "image");
    assert.equal(
      qualityCompanyDocViewKind({
        name: "code.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "office",
    );
    assert.equal(qualityCompanyDocViewKind({ name: "note.txt", type: "text/plain" }), "text");
    assert.equal(qualityCompanyDocViewKind({ name: "ASME IX.zip", type: "application/zip" }), "zip");
    assert.equal(qualityCompanyDocViewKind({ name: "codes.zip", type: "application/x-zip-compressed" }), "zip");
    assert.equal(qualityCompanyDocViewKind({ name: "codes.zip" }), "zip");
    assert.equal(
      primaryQualityCompanyDocFile([
        { name: "older.pdf", vaulted: true },
        { name: "latest.pdf", vaulted: true },
        { name: "local.pdf", vaulted: false },
      ])?.name,
      "latest.pdf",
    );
    assert.match(
      qualityCompanyDocViewPath("madison", "quality-control-manual", "qc-manual.pdf"),
      /scope=company-docs.*folder=quality-control-manual.*file=qc-manual\.pdf/,
    );
    const viewer = source("../components/QualityCompanyDocViewer.tsx");
    assert.match(viewer, /quality-company-doc-library/);
    assert.match(viewer, /Open \/ download/);
    assert.match(viewer, /iframe/);
    assert.match(viewer, /archive/);
    assert.match(viewer, /readQualityCompanyDocZipMembers/);
    assert.match(viewer, /pickQualityCompanyDocZipMember/);
    assert.match(viewer, /Back to pack/);
    assert.match(viewer, /qualityCompanyDocPreviewType/);
    assert.match(viewer, /canRemove/);
    assert.match(viewer, /Confirm remove/);
    assert.match(viewer, /Remove this file from/);
    assert.match(viewer, /alertdialog/);
    assert.match(viewer, /file\.protected/);
    assert.match(viewer, /Remove/);
    assert.match(viewer, /kind === "pdf" && href/);
    assert.match(viewer, /kind === "text" && text != null/);
    assert.doesNotMatch(viewer, /drive\.google\.com/);
  });

  it("previews a file named x.pdf as application/pdf even when Drive says text/plain", () => {
    const mislabeled = { name: "x.pdf", type: "text/plain", data: "JVBERi0x" };
    assert.equal(qualityCompanyDocViewKind(mislabeled), "pdf");
    assert.equal(qualityCompanyDocPreviewType(mislabeled), "application/pdf");
    assert.equal(qualityCompanyDocPreviewType({ name: "docs/ASME IX.pdf", type: "text/plain" }), "application/pdf");
    assert.equal(qualityCompanyDocPreviewType({ name: "stamp.png", type: "text/plain" }), "image/png");
    assert.equal(qualityCompanyDocPreviewType({ name: "note.txt", type: "application/octet-stream" }), "text/plain");
    const published = publicQualityCompanyDocFile(mislabeled);
    assert.equal(published?.type, "application/pdf");
    assert.equal(qualityCompanyDocGoogleNativeType("application/vnd.google-apps.document"), true);
    assert.equal(qualityCompanyDocGoogleNativeType("application/vnd.google-apps.folder"), false);
    assert.equal(qualityCompanyDocViewKind({ name: "x.pdf", type: "application/vnd.google-apps.document" }), "other");
    assert.equal(publicQualityCompanyDocFile({
      name: "x.pdf",
      type: "application/vnd.google-apps.document",
      data: "QQ==",
    }), null);
    assert.match(QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR, /Google Doc/);
    const viewer = source("../components/QualityCompanyDocViewer.tsx");
    assert.match(viewer, /new Blob\(\[bytes\], \{ type \}\)/);
    assert.match(viewer, /qualityCompanyDocPreviewType\(file\)/);
    assert.doesNotMatch(viewer, /new Blob\(\[bytes\], \{ type: file\.type/);
  });
});
