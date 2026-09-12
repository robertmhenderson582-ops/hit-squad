import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { memoryDrive } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { isHseCompanyDocsJobId } from "./hse-company-docs.ts";
import { listHseCompanyDocDrop } from "./hse-company-doc-drops.ts";
import { listHseFolderDrops } from "./hse-folder-drops.ts";
import { listHsePackageShelf } from "./hse-package-shelf-drops.ts";
import {
  HSE_TEMPLATE_FILL_TEMPLATE_ERROR,
  HSE_TEMPLATE_FILL_VIEW_ERROR,
  HSE_TEMPLATE_FORM_MARK,
  MADISON_JSA_TITLE,
  hseFilledCopyName,
  hseTemplateFormForCatalog,
  hseTemplateFormToLead,
} from "./hse-template-form.ts";
import {
  readHseTemplateFill,
  removeHseTemplateFill,
  saveHseTemplateFill,
} from "./hse-template-form-drops.ts";
import { HSE_MODULE_CATALOG } from "./hse-folders.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-hse-fill-"));
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function fillFile(destLabel: string, job = "Boiler 17", extra = "") {
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

describe("HSE template fill vault paths", { concurrency: 1 }, () => {
  it("saves to a job, retrieves, edits, re-saves, and never writes the company rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "job"));
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
      source: "catalog",
      sourceFolder: "jsa",
      sourceName: "Madison JSA.pdf",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.dest, "job");
    assert.equal(isHseCompanyDocsJobId(saved.jobId), false);
    const listed = await listHseFolderDrops(wendell, "job-b17", "jsa", "madison");
    assert.equal(listed.files.some((file) => file.name === first.name), true);
    const jobPackage = await listHseFolderDrops(wendell, "job-b17", "packages", "madison");
    assert.equal(jobPackage.files.some((file) => file.name === first.name), true);
    assert.deepEqual(saved.ripple.surfaces, ["job-folder", "job-package", "vault-tree", "briefs-index"]);
    const rail = await listHseCompanyDocDrop(wendell, "jsas", "madison");
    assert.equal(rail.files.some((file) => file.name === first.name), false);
    assert.equal(rail.files.some((file) => file.name === "Madison JSA.pdf"), false);

    const read = await readHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.form.fields.job, "Boiler 17");
    assert.equal(read.form.rows[0]?.cells.task, "Torch cut");

    const edited = fillFile("Boiler 17", "Boiler 17 night", "edit");
    edited.name = first.name;
    const replaced = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
      source: "catalog",
      sourceFolder: "jsa",
      sourceName: "Madison JSA.pdf",
      files: [edited],
      replace: true,
    });
    assert.equal(replaced.ok, true);
    const reread = await readHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(reread.ok, true);
    if (!reread.ok) return;
    assert.equal(reread.form.fields.job, "Boiler 17 night");
    const fromHome = await readHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(fromHome.ok && fromHome.form.fields.job, "Boiler 17 night");

    const removed = await removeHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(removed.ok, true);
    const gone = await listHseFolderDrops(wendell, "job-b17", "jsa", "madison");
    assert.equal(gone.files.some((file) => file.name === first.name), false);
    const gonePack = await listHseFolderDrops(wendell, "job-b17", "packages", "madison");
    assert.equal(gonePack.files.some((file) => file.name === first.name), false);
  });

  it("saves a Ready prepackage and rejects template overwrite / viewer writes", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("Day-1 kit");
    const saved = await saveHseTemplateFill(wendell, {
      dest: "prepackage",
      packageName: "Day-1 kit",
      folderId: "jsa",
      companyId: "madison",
      companyLabel: "Madison",
      source: "catalog",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const shelf = await listHsePackageShelf(wendell, "madison");
    assert.equal(shelf.kits.some((kit) => kit.files.some((file) => file.name === first.name)), true);

    const overwrite = await saveHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      companyId: "madison",
      sourceName: first.name,
      files: [{ ...first, name: "Madison JSA.pdf" }],
    });
    assert.equal(overwrite.ok, false);
    if (!overwrite.ok) assert.equal(overwrite.error, HSE_TEMPLATE_FILL_TEMPLATE_ERROR);

    const viewer = await saveHseTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "jsa",
      companyId: "madison",
      files: [first],
    });
    assert.equal(viewer.ok, false);
    if (!viewer.ok) assert.equal(viewer.error, HSE_TEMPLATE_FILL_VIEW_ERROR);

    const pmKit = await saveHseTemplateFill(nathan, {
      dest: "prepackage",
      packageName: "PM kit",
      folderId: "jsa",
      companyId: "madison",
      files: [first],
    });
    assert.equal(pmKit.ok, false);
  });

  it("saves a filled copy for every catalog radio without writing company-docs", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "radios"));
    useLeadBriefVaultForTests(drive);
    for (const radio of HSE_MODULE_CATALOG) {
      const def = hseTemplateFormForCatalog(radio.id)!;
      const name = hseFilledCopyName({
        title: def.title,
        destLabel: "Boiler 17",
        userName: wendell.name,
        at: new Date(2026, 8, 12, 12, 0, 0),
      });
      const file = hseTemplateFormToLead(
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
          fields: { notes: radio.id },
          rows: [],
        },
        name,
      );
      const saved = await saveHseTemplateFill(wendell, {
        dest: "job",
        jobId: "job-b17",
        folderId: radio.id,
        companyId: "madison",
        companyLabel: "Madison",
        siteLabel: "Wood River",
        jobLabel: "Boiler 17",
        source: "catalog",
        files: [file],
      });
      assert.equal(saved.ok, true, radio.id);
      const listed = await listHseFolderDrops(wendell, "job-b17", radio.id, "madison");
      assert.equal(listed.files.some((row) => row.name === file.name), true, radio.id);
    }
    const rail = await listHseCompanyDocDrop(wendell, "safety-manual", "madison");
    assert.equal(rail.files.length, 0);
    assert.ok(MADISON_JSA_TITLE);
  });
});
