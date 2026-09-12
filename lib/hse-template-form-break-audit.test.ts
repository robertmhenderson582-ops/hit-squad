/**
 * Nightly break-test + feed-in/feed-out matrix for always-displayed HSE forms.
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
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { hseCompanyDocsJobId } from "./hse-company-docs.ts";
import { listHseFolderDrops } from "./hse-folder-drops.ts";
import { hseReadyShelfJobId } from "./hse-package-shelf.ts";
import {
  HSE_TEMPLATE_FEED_RULE,
  hseTemplateFeedComplete,
} from "./hse-template-form-feed.ts";
import {
  HSE_TEMPLATE_FILL_DEST_ERROR,
  HSE_TEMPLATE_FILL_EMPTY_ERROR,
  HSE_TEMPLATE_FILL_JOB_ERROR,
  HSE_TEMPLATE_FILL_TEMPLATE_ERROR,
  HSE_TEMPLATE_FILL_VIEW_ERROR,
  HSE_TEMPLATE_FORM_MARK,
  parseHseTemplateForm,
  hseFilledCopyName,
  hseTemplateFormForCatalog,
  hseTemplateFormToLead,
  serializeHseTemplateForm,
} from "./hse-template-form.ts";
import {
  readHseTemplateFill,
  saveHseTemplateFill,
} from "./hse-template-form-drops.ts";
import { auditHseTemplateFillRipple } from "./hse-template-form-audit.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-hse-fill-break-"));
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function fillFile(destLabel = "Boiler 17", job = "Boiler 17", extra = "") {
  const def = hseTemplateFormForCatalog("jsa")!;
  const name = hseFilledCopyName({
    title: def.title,
    destLabel,
    userName: wendell.name,
    at: new Date(2026, 8, 12, 12, 0, 0),
    sourceName: "Madison JSA.pdf",
  });
  return hseTemplateFormToLead(
    {
      mark: HSE_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog",
      sourceFolder: "jsa",
      sourceName: "Madison JSA.pdf",
      dest: destLabel === "Day-1 kit" ? "prepackage" : "job",
      destLabel,
      savedAt: "2026-09-12T12:00:00.000Z",
      user: wendell.name,
      fields: { job, task: extra || "Piperack" },
      rows: [{ id: "row-1", cells: { task: extra ? `Task-${extra}` : "Torch cut", crew: "Nights" } }],
    },
    name,
  );
}

function emptyFill() {
  const def = hseTemplateFormForCatalog("jsa")!;
  const name = hseFilledCopyName({
    title: def.title,
    destLabel: "Boiler 17",
    userName: wendell.name,
    at: new Date(2026, 8, 12, 12, 0, 0),
  });
  return hseTemplateFormToLead(
    {
      mark: HSE_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog",
      dest: "job",
      destLabel: "Boiler 17",
      savedAt: "2026-09-12T12:00:00.000Z",
      user: wendell.name,
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

describe("HSE template fill break matrix", { concurrency: 1 }, () => {
  it("names feed-in and feed-out and keeps both on the desk", () => {
    assert.match(HSE_TEMPLATE_FEED_RULE, /One-way-only is a fail/);
    const job = hseTemplateFeedComplete({
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
    const form = source("../components/HseTemplateForm.tsx");
    assert.match(form, /HSE_TEMPLATE_FILL_EMPTY_ERROR/);
    assert.match(form, /Download filled copy/);
    const pkg = source("../package.json");
    assert.match(pkg, /hse-template-form-break-audit\.test\.ts/);
  });

  it("rejects overwrite template, wrong target, empty save, and ACL writes", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "break-reject"));
    useLeadBriefVaultForTests(drive);
    const good = fillFile();
    const blank = emptyFill();
    const noFiles = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      files: [],
    });
    assert.equal(noFiles.ok, false);
    if (!noFiles.ok) assert.equal(noFiles.error, HSE_TEMPLATE_FILL_EMPTY_ERROR);

    const empty = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      sourceName: "Madison JSA.pdf",
      files: [blank],
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error, HSE_TEMPLATE_FILL_EMPTY_ERROR);

    const overwrite = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      sourceName: "Madison JSA.pdf",
      files: [{ ...good, name: "Madison JSA.pdf" }],
    });
    assert.equal(overwrite.ok, false);
    if (!overwrite.ok) assert.equal(overwrite.error, HSE_TEMPLATE_FILL_TEMPLATE_ERROR);

    const noDest = await saveHseTemplateFill(wendell, {
      jobId: "job-b17",
      folderId: "jsa",
      files: [good],
    });
    assert.equal(noDest.ok, false);
    if (!noDest.ok) assert.equal(noDest.error, HSE_TEMPLATE_FILL_DEST_ERROR);

    const noJob = await saveHseTemplateFill(wendell, {
      dest: "job",
      folderId: "jsa",
      files: [good],
    });
    assert.equal(noJob.ok, false);
    if (!noJob.ok) assert.equal(noJob.error, HSE_TEMPLATE_FILL_JOB_ERROR);

    const railJob = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: hseCompanyDocsJobId("madison"),
      folderId: "jsa",
      files: [good],
    });
    assert.equal(railJob.ok, false);
    if (!railJob.ok) assert.equal(railJob.error, HSE_TEMPLATE_FILL_JOB_ERROR);

    const shelfAsJob = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: hseReadyShelfJobId("day-1"),
      folderId: "jsa",
      files: [good],
    });
    assert.equal(shelfAsJob.ok, false);

    const noKit = await saveHseTemplateFill(wendell, {
      dest: "prepackage",
      files: [good],
    });
    assert.equal(noKit.ok, false);
    if (!noKit.ok) {
      assert.equal(noKit.status, 400);
      assert.match(noKit.error, /package|prepackage/i);
    }

    const viewer = await saveHseTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      files: [good],
    });
    assert.equal(viewer.ok, false);
    if (!viewer.ok) assert.equal(viewer.error, HSE_TEMPLATE_FILL_VIEW_ERROR);

    const pmKit = await saveHseTemplateFill(nathan, {
      dest: "prepackage",
      packageName: "Upcoming",
      files: [good],
    });
    assert.equal(pmKit.ok, false);
  });

  it("feeds in to a job and feeds out from Packages, download, edit, and re-save", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "break-feed"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Boiler 17");
    const saved = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    const fromPackages = await readHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(fromPackages.ok, true);
    if (!fromPackages.ok) return;
    assert.equal(fromPackages.form.folderId, "jsa");
    assert.equal(fromPackages.form.fields.job, "Boiler 17");
    assert.equal(fromPackages.form.rows[0]?.cells.task, "Torch cut");

    const text = serializeHseTemplateForm(fromPackages.form);
    const parsed = parseHseTemplateForm(text);
    assert.equal(parsed?.fields.job, "Boiler 17");

    const listed = await listHseFolderDrops(wendell, "job-b17", "packages", "madison");
    assert.equal(listed.files.some((file) => file.name === first.name), true);

    const audit = await auditHseTemplateFillRipple({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "jsa",
      fileName: first.name,
      actor: wendell,
    });
    assert.equal(audit.ok, true, audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; "));
  });

  it("rolls back a partial job ripple when the second folder write fails", async () => {
    const inner = memoryDrive();
    const drive = failAfterUploads(inner, 1);
    resetLeadBriefStoreForTests(join(dir, "break-partial"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile();
    const saved = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      files: [first],
    });
    assert.equal(saved.ok, false);
    const folder = await listHseFolderDrops(wendell, "job-b17", "jsa", "madison");
    const packages = await listHseFolderDrops(wendell, "job-b17", "packages", "madison");
    assert.equal(folder.files.some((file) => file.name === first.name), false);
    assert.equal(packages.files.some((file) => file.name === first.name), false);
  });
});
