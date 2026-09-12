/**
 * Nightly break-test + feed-in/feed-out matrix for always-displayed Quality forms.
 * If it can break, this file must keep failing until it is fixed.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { memoryDrive, type DriveAdapter } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { qualityCompanyDocsJobId } from "./quality-company-docs.ts";
import { listQualityCompanyDocDrop } from "./quality-company-doc-drops.ts";
import { listQualityFolderDrops } from "./quality-folder-drops.ts";
import { qualityReadyShelfJobId } from "./quality-package-shelf.ts";
import {
  QUALITY_TEMPLATE_FEED_RULE,
  qualityTemplateFeedComplete,
} from "./quality-template-form-feed.ts";
import {
  QUALITY_TEMPLATE_FILL_DEST_ERROR,
  QUALITY_TEMPLATE_FILL_EMPTY_ERROR,
  QUALITY_TEMPLATE_FILL_JOB_ERROR,
  QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR,
  QUALITY_TEMPLATE_FILL_VIEW_ERROR,
  QUALITY_TEMPLATE_FORM_MARK,
  parseQualityTemplateForm,
  qualityFilledCopyName,
  qualityTemplateFormForCatalog,
  qualityTemplateFormToLead,
  serializeQualityTemplateForm,
} from "./quality-template-form.ts";
import {
  readQualityTemplateFill,
  removeQualityTemplateFill,
  saveQualityTemplateFill,
} from "./quality-template-form-drops.ts";
import { auditQualityTemplateFillRipple } from "./quality-template-form-audit.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-fill-break-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function fillFile(destLabel = "Boiler 17", job = "Boiler 17", extra = "") {
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

function emptyFill() {
  const def = qualityTemplateFormForCatalog("flange-log")!;
  const name = qualityFilledCopyName({
    title: def.title,
    destLabel: "Boiler 17",
    userName: chance.name,
    at: new Date(2026, 8, 12, 12, 0, 0),
  });
  return qualityTemplateFormToLead(
    {
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog",
      dest: "job",
      destLabel: "Boiler 17",
      savedAt: "2026-09-12T12:00:00.000Z",
      user: chance.name,
      fields: { job: "   " },
      rows: [],
    },
    name,
  );
}

function failAfterUploads(inner: ReturnType<typeof memoryDrive>, after: number): DriveAdapter {
  let uploads = 0;
  return {
    ...inner,
    uploadBytes: async (folderId, name, bytes, mimeType, properties) => {
      uploads += 1;
      if (uploads > after) throw new Error("injected vault fail");
      return inner.uploadBytes!(folderId, name, bytes, mimeType, properties);
    },
  };
}

describe("Quality template fill break matrix", { concurrency: 1 }, () => {
  it("names feed-in and feed-out and keeps both on the desk", () => {
    assert.match(QUALITY_TEMPLATE_FEED_RULE, /One-way-only is a fail/);
    const job = qualityTemplateFeedComplete({
      dest: "job",
      in: ["open-blank", "fill", "save-job"],
      out: [
        "list-job-folder",
        "list-job-package",
        "list-vault-tree",
        "retrieve",
        "reopen",
        "edit-resave",
        "download",
        "parse-download",
      ],
    });
    assert.equal(job.ok, true);
    const form = source("../components/QualityTemplateForm.tsx");
    assert.match(form, /QUALITY_TEMPLATE_FILL_EMPTY_ERROR/);
    assert.match(form, /session.fileName \|\| session.filledName/);
    assert.match(form, /Download filled copy/);
    const pkg = source("../package.json");
    assert.match(pkg, /quality-template-form-break-audit\.test\.ts/);
  });

  it("rejects overwrite template, wrong target, empty save, and ACL writes", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "break-reject"));
    useLeadBriefVaultForTests(drive);
    const good = fillFile();
    const blank = emptyFill();
    const noFiles = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      files: [],
    });
    assert.equal(noFiles.ok, false);
    if (!noFiles.ok) assert.equal(noFiles.error, QUALITY_TEMPLATE_FILL_EMPTY_ERROR);

    const empty = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [blank],
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error, QUALITY_TEMPLATE_FILL_EMPTY_ERROR);

    const overwrite = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
      files: [{ ...good, name: "2.7.19 Madison Flange Log Rev.1.pdf" }],
    });
    assert.equal(overwrite.ok, false);
    if (!overwrite.ok) assert.equal(overwrite.error, QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR);

    const noDest = await saveQualityTemplateFill(chance, {
      jobId: "job-b17",
      folderId: "flange-log",
      files: [good],
    });
    assert.equal(noDest.ok, false);
    if (!noDest.ok) assert.equal(noDest.error, QUALITY_TEMPLATE_FILL_DEST_ERROR);

    const noJob = await saveQualityTemplateFill(chance, {
      dest: "job",
      folderId: "flange-log",
      files: [good],
    });
    assert.equal(noJob.ok, false);
    if (!noJob.ok) assert.equal(noJob.error, QUALITY_TEMPLATE_FILL_JOB_ERROR);

    const railJob = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: qualityCompanyDocsJobId("madison"),
      folderId: "flange-log",
      files: [good],
    });
    assert.equal(railJob.ok, false);
    if (!railJob.ok) assert.equal(railJob.error, QUALITY_TEMPLATE_FILL_JOB_ERROR);

    const shelfAsJob = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: qualityReadyShelfJobId("day-1"),
      folderId: "flange-log",
      files: [good],
    });
    assert.equal(shelfAsJob.ok, false);

    const noKit = await saveQualityTemplateFill(chance, {
      dest: "prepackage",
      files: [good],
    });
    assert.equal(noKit.ok, false);
    if (!noKit.ok) {
      assert.equal(noKit.status, 400);
      assert.match(noKit.error, /package|prepackage/i);
    }

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
    if (!pmKit.ok) assert.equal(pmKit.error, QUALITY_TEMPLATE_FILL_VIEW_ERROR);
  });

  it("feeds in to a job and feeds out from Packages, download, edit, and re-save", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "break-feed"));
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
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    const fromPackages = await readQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(fromPackages.ok, true);
    if (!fromPackages.ok) return;
    assert.equal(fromPackages.form.folderId, "flange-log");
    assert.equal(fromPackages.form.fields.job, "Boiler 17");
    assert.equal(fromPackages.form.rows[0]?.cells.flangeId, "F-12");

    const downloaded = parseQualityTemplateForm(
      serializeQualityTemplateForm({
        ...fromPackages.form,
        mark: QUALITY_TEMPLATE_FORM_MARK,
      }),
    );
    assert.ok(downloaded);
    assert.equal(downloaded?.fields.job, "Boiler 17");
    assert.equal(downloaded?.rows[0]?.cells.flangeId, "F-12");

    const edited = fillFile("Boiler 17", "Boiler 17 night", "out");
    edited.name = first.name;
    const replaced = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      files: [edited],
    });
    assert.equal(replaced.ok, true);
    const againHome = await readQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      companyId: "madison",
    });
    const againPackage = await readQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(againHome.ok, true);
    assert.equal(againPackage.ok, true);
    if (againHome.ok) assert.equal(againHome.form.fields.job, "Boiler 17 night");
    if (againPackage.ok) assert.equal(againPackage.form.rows[0]?.cells.flangeId, "F-out");

    const audit = await auditQualityTemplateFillRipple({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      actor: chance,
    });
    assert.equal(audit.ok, true, audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; "));

    const rail = await listQualityCompanyDocDrop(chance, "forms", "madison");
    assert.equal(rail.files.some((file) => file.name === first.name), false);
  });

  it("rolls back a partial job ripple so one folder is not left listed", async () => {
    const inner = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "break-partial"));
    useLeadBriefVaultForTests(failAfterUploads(inner, 1));
    const first = fillFile();
    const saved = await saveQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "flange-log",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      files: [first],
    });
    assert.equal(saved.ok, false);
    const home = await listQualityFolderDrops(chance, "job-b17", "flange-log", "madison");
    const packages = await listQualityFolderDrops(chance, "job-b17", "packages", "madison");
    assert.equal(home.files.some((file) => file.name === first.name), false);
    assert.equal(packages.files.some((file) => file.name === first.name), false);
    const briefs = await listStoredBriefs("quality", chance.email, { jobId: "job-b17" });
    assert.equal(briefs.some((row) => row.files.some((file) => file.name === first.name)), false);
  });

  it("feeds a Ready prepackage copy back out from the shelf without touching a job folder", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "break-kit"));
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
    const opened = await readQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      folderId: "flange-log",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.equal(opened.form.fields.job, "Boiler 17");
    const jobFolder = await listQualityFolderDrops(chance, "job-b17", "flange-log", "madison");
    assert.equal(jobFolder.files.some((file) => file.name === first.name), false);
    const gone = await removeQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(gone.ok, true);
    const missing = await readQualityTemplateFill(chance, {
      dest: "prepackage",
      packageId: saved.packageId,
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(missing.ok, false);
  });
});
