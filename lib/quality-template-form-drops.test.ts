import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { qualityFolderId } from "./drive-data.ts";
import { DriveApiError, memoryDrive, type DriveAdapter } from "./drive-estimates.ts";
import { QUALITY_VAULT_QUOTA_ERROR } from "./quality-vault-shared.ts";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { isQualityCompanyDocsJobId, qualityCompanyDocsJobId } from "./quality-company-docs.ts";
import { listQualityCompanyDocDrop } from "./quality-company-doc-drops.ts";
import { listQualityFolderDrops } from "./quality-folder-drops.ts";
import { listQualityPackageShelf } from "./quality-package-shelf-drops.ts";
import { isQualityReadyShelfJobId } from "./quality-package-shelf.ts";
import {
  QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR,
  QUALITY_TEMPLATE_FILL_VIEW_ERROR,
  QUALITY_TEMPLATE_FORM_MARK,
  qualityFilledCopyName,
  qualityTemplateFormForCatalog,
  qualityTemplateFormToLead,
} from "./quality-template-form.ts";
import {
  qualityTemplateFillSharedReadWho,
  readQualityTemplateFill,
  removeQualityTemplateFill,
  saveQualityTemplateFill,
} from "./quality-template-form-drops.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-fill-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function fillFile(destLabel: string, job = "Boiler 17", extra = "") {
  const def = qualityTemplateFormForCatalog("flange-log")!;
  const name = qualityFilledCopyName({
    title: def.title,
    destLabel,
    userName: chance.name,
    at: new Date(2026, 8, 12, 12, 0, 0),
    sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
  });
  return qualityTemplateFormToLead(
    {
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog",
      sourceFolder: "flange-log",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      dest: destLabel === "Day-1 kit" ? "prepackage" : "job",
      destLabel,
      savedAt: "2026-09-12T12:00:00.000Z",
      user: chance.name,
      fields: { job },
      rows: [{ id: "row-1", cells: { flangeId: extra ? `F-${extra}` : "F-12", location: "Area A" } }],
    },
    name,
  );
}

describe("Quality template fill vault paths", { concurrency: 1 }, () => {
  it("saves to a job, retrieves, edits, re-saves, and never writes the company rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "job"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Boiler 17");
    const saved = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      source: "catalog",
      sourceFolder: "flange-log",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.dest, "job");
    assert.equal(isQualityCompanyDocsJobId(saved.jobId), false);
    const listed = await listQualityFolderDrops(chance, "job-b17", "flange-log", "madison");
    assert.equal(listed.files.some((file) => file.name === first.name), true);
    const jobPackage = await listQualityFolderDrops(chance, "job-b17", "packages", "madison");
    assert.equal(jobPackage.files.some((file) => file.name === first.name), true);
    if (saved.ok) {
      assert.deepEqual(saved.ripple.surfaces, ["job-folder", "job-package", "vault-tree", "briefs-index"]);
    }
    const rail = await listQualityCompanyDocDrop(chance, "forms", "madison");
    assert.equal(rail.files.some((file) => file.name === first.name), false);
    assert.equal(rail.files.some((file) => file.name === "2.7.19 Madison Flange Log Rev.1.pdf"), false);

    const read = await readQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.form.fields.job, "Boiler 17");
    assert.equal(read.form.rows[0]?.cells.flangeId, "F-12");

    const edited = fillFile("Boiler 17", "Boiler 17 night", "edit");
    edited.name = first.name;
    const replaced = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      companyId: "madison",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [edited],
      replace: true,
    });
    assert.equal(replaced.ok, true);
    const again = await readQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.form.fields.job, "Boiler 17 night");
    assert.equal(again.form.rows[0]?.cells.flangeId, "F-edit");

    const removed = await removeQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(removed.ok, true);
    const gone = await listQualityFolderDrops(chance, "job-b17", "flange-log", "madison");
    assert.equal(gone.files.some((file) => file.name === first.name), false);
    const gonePackage = await listQualityFolderDrops(chance, "job-b17", "packages", "madison");
    assert.equal(gonePackage.files.some((file) => file.name === first.name), false);
  });

  it("saves to a Ready prepackage, retrieves, edits, and keeps the kit off the rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Day-1 kit");
    const saved = await saveQualityTemplateFill(chance, {
      dest: "prepackage",
      packageName: "Day-1 kit",
      companyId: "madison",
      companyLabel: "Madison",
      source: "catalog",
      sourceFolder: "flange-log",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.dest, "prepackage");
    assert.equal(isQualityReadyShelfJobId(saved.jobId), true);
    const kits = await listQualityPackageShelf(chance, "madison");
    assert.equal(kits.kits.some((kit) => kit.files.some((file) => file.name === first.name)), true);
    const read = await readQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.form.fields.job, "Boiler 17");
    const edited = fillFile("Day-1 kit", "Upcoming night");
    edited.name = first.name;
    const replaced = await saveQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      packageName: "Day-1 kit",
      companyId: "madison",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [edited],
    });
    assert.equal(replaced.ok, true);
    const again = await readQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.form.fields.job, "Upcoming night");
    const rail = await listQualityCompanyDocDrop(chance, "forms", "madison");
    assert.equal(rail.files.some((file) => file.name === first.name), false);
  });

  it("rejects template overwrite, company-doc destinations, and viewer writes", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "acl"));
    useLeadBriefVaultForTests(drive);
    const good = fillFile("Boiler 17");
    const sameName = { ...good, name: "2.7.19 Madison Flange Log Rev.1.pdf" };
    const overwrite = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [sameName],
    });
    assert.equal(overwrite.ok, false);
    if (!overwrite.ok) assert.equal(overwrite.error, QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR);

    const railJob = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: qualityCompanyDocsJobId("madison"),
      folderId: "forms",
      files: [good],
    });
    assert.equal(railJob.ok, false);

    const viewer = await saveQualityTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      files: [good],
    });
    assert.equal(viewer.ok, false);
    if (!viewer.ok) assert.equal(viewer.error, QUALITY_TEMPLATE_FILL_VIEW_ERROR);

    const pmKit = await saveQualityTemplateFill(nathan, {
      dest: "prepackage",
      packageName: "Upcoming",
      files: [good],
    });
    assert.equal(pmKit.ok, false);

    const pmJob = await saveQualityTemplateFill(nathan, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      companyId: "madison",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [good],
    });
    assert.equal(pmJob.ok, true);
    const briefs = await listStoredBriefs("quality", nathan.email, { jobId: "job-b17", folderId: "flange-log" });
    assert.equal(briefs[0]?.files.some((file) => file.name === good.name), true);

    const viewed = await readQualityTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: good.name,
      companyId: "madison",
    });
    assert.equal(viewed.ok, true);
    if (viewed.ok) assert.equal(viewed.form.fields.job, "Boiler 17");
    assert.equal(qualityTemplateFillSharedReadWho(), undefined);
  });

  it("saves a filled copy for every catalog radio without writing company-docs", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "all-radios"));
    useLeadBriefVaultForTests(drive);
    const { QUALITY_MODULE_CATALOG } = await import("./quality-folders.ts");
    const { qualityTemplateFormForCatalog, qualityFilledCopyName, qualityTemplateFormToLead, QUALITY_TEMPLATE_FORM_MARK } =
      await import("./quality-template-form.ts");
    for (const radio of QUALITY_MODULE_CATALOG) {
      const def = qualityTemplateFormForCatalog(radio.id);
      assert.ok(def, radio.id);
      const name = qualityFilledCopyName({
        title: def.title,
        destLabel: "Boiler 17",
        userName: chance.name,
        at: new Date(2026, 8, 12, 12, 0, 0),
      });
      const fieldId = def.fields[0]?.id || "notes";
      const file = qualityTemplateFormToLead(
        {
          mark: QUALITY_TEMPLATE_FORM_MARK,
          id: def.id,
          title: def.title,
          folderId: def.folderId,
          source: "catalog",
          sourceFolder: radio.id,
          dest: "job",
          destLabel: "Boiler 17",
          savedAt: "2026-09-12T12:00:00.000Z",
          user: chance.name,
          fields: { [fieldId]: radio.id },
          rows: [],
        },
        name,
      );
      const saved = await saveQualityTemplateFill(chance, {
        dest: "job",
        jobId: "job-b17",
        folderId: def.folderId,
        companyId: "madison",
        files: [file],
      });
      assert.equal(saved.ok, true, radio.id);
      if (!saved.ok) continue;
      assert.equal(isQualityCompanyDocsJobId(saved.jobId), false);
      const read = await readQualityTemplateFill(chance, {
        dest: "job",
        jobId: "job-b17",
        folderId: def.folderId,
        fileName: file.name,
        companyId: "madison",
      });
      assert.equal(read.ok, true, radio.id);
      if (read.ok) assert.equal(read.form.fields[fieldId], radio.id);
    }
    const { QUALITY_COMPANY_DOC_CATALOG } = await import("./quality-company-docs.ts");
    const { qualityTemplateFormForCompanyDoc } = await import("./quality-template-form.ts");
    for (const doc of QUALITY_COMPANY_DOC_CATALOG) {
      const def = qualityTemplateFormForCompanyDoc(doc.id);
      assert.ok(def, doc.id);
      const fieldId = def.fields[0]?.id || "notes";
      const name = qualityFilledCopyName({
        title: def.title,
        destLabel: "Boiler 17",
        userName: chance.name,
        at: new Date(2026, 8, 12, 12, 0, 0),
      });
      const file = qualityTemplateFormToLead(
        {
          mark: QUALITY_TEMPLATE_FORM_MARK,
          id: def.id,
          title: def.title,
          folderId: def.folderId,
          source: "company-docs",
          sourceFolder: doc.id,
          sourceName: `${doc.id}.pdf`,
          dest: "job",
          destLabel: "Boiler 17",
          savedAt: "2026-09-12T12:00:00.000Z",
          user: chance.name,
          fields: { [fieldId]: doc.id },
          rows: [],
        },
        name,
      );
      const saved = await saveQualityTemplateFill(chance, {
        dest: "job",
        jobId: "job-b17",
        folderId: def.folderId,
        companyId: "madison",
        source: "company-docs",
        sourceFolder: doc.id,
        sourceName: `${doc.id}.pdf`,
        files: [file],
      });
      assert.equal(saved.ok, true, doc.id);
      if (!saved.ok) continue;
      assert.equal(isQualityCompanyDocsJobId(saved.jobId), false);
    }
  });

  it("Packages Save as new does not walk sibling Quality folders to verify the write", async () => {
    const inner = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit-list-cost"));
    const root = qualityFolderId();
    for (let i = 0; i < 18; i += 1) {
      await inner.createFolder!(root, `Other Co ${i}`);
    }
    let lists = 0;
    const drive: DriveAdapter = {
      ...inner,
      async listChildren(folderId) {
        lists += 1;
        return inner.listChildren!(folderId);
      },
    };
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Day-1 kit");
    const saved = await saveQualityTemplateFill(chance, {
      dest: "prepackage",
      packageName: "Day-1 kit",
      companyId: "madison",
      companyLabel: "Madison",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.ok(lists <= 16, `Save as new listed ${lists} folders; a tree walk of 18 siblings would be far higher`);
    const opened = await readQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      packageName: "Day-1 kit",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(opened.ok, true);
    if (opened.ok) assert.equal(opened.form.fields.job, "Boiler 17");
  });

  it("quota during post-save verify fail-fasts and keeps the landed Ready kit", async () => {
    const inner = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit-quota-verify"));
    let wrote = false;
    const drive: DriveAdapter = {
      ...inner,
      async uploadBytes(folderId, name, bytes, mimeType, properties) {
        const row = await inner.uploadBytes!(folderId, name, bytes, mimeType, properties);
        wrote = true;
        return row;
      },
      async listChildren(folderId) {
        if (wrote) {
          throw new DriveApiError(403, "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'");
        }
        return inner.listChildren!(folderId);
      },
    };
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Day-1 kit");
    const saved = await saveQualityTemplateFill(owner, {
      dest: "prepackage",
      packageName: "Day-1 kit",
      companyId: "madison",
      companyLabel: "Madison",
      files: [first],
    });
    assert.equal(saved.ok, false);
    if (!saved.ok) assert.equal(saved.error, QUALITY_VAULT_QUOTA_ERROR);
    const leftover = [...inner.tree.values()].some((row) => row.file.name === first.name);
    assert.equal(leftover, true);
  });

  it("quota on the first Packages path list fail-fasts without a named-copy tree walk", async () => {
    const inner = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit-quota-list"));
    const root = qualityFolderId();
    for (let i = 0; i < 12; i += 1) {
      await inner.createFolder!(root, `Other Co ${i}`);
    }
    let lists = 0;
    const drive: DriveAdapter = {
      ...inner,
      async listChildren() {
        lists += 1;
        throw new DriveApiError(403, "Quota exceeded for quota metric 'Total Query Cost'");
      },
    };
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Night kit");
    const saved = await saveQualityTemplateFill(owner, {
      dest: "prepackage",
      packageName: "Night kit",
      companyId: "madison",
      companyLabel: "Madison",
      files: [first],
    });
    assert.equal(saved.ok, false);
    if (!saved.ok) assert.equal(saved.error, QUALITY_VAULT_QUOTA_ERROR);
    assert.ok(lists <= 4, `quota must stop the path walk, got ${lists} listChildren calls`);
  });
});
