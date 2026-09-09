import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QUALITY_COMPANY_DOCS,
  QUALITY_COMPANY_DOC_CATALOG,
  QUALITY_COMPANY_DOC_TEMPLATES,
  cloneQualityCompanyDocTemplate,
  isQualityCompanyDocId,
  qualityCompanyDocCollidesWithJobFolder,
  qualityCompanyDocHome,
  qualityCompanyDocLabel,
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
    const catalog = source("./quality-company-docs.ts");
    for (const label of QUALITY_COMPANY_DOCS.map((doc) => doc.label)) {
      assert.match(catalog, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
