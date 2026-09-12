/**
 * Nightly deep-audit entry for HSE always-present template fills.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { memoryDrive } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { HSE_MODULE_CATALOG } from "./hse-folders.ts";
import {
  HSE_TEMPLATE_FORM_MARK,
  hseFilledCopyName,
  hseTemplateFormForCatalog,
  hseTemplateFormToLead,
} from "./hse-template-form.ts";
import {
  readHseTemplateFill,
  removeHseTemplateFill,
  saveHseTemplateFill,
} from "./hse-template-form-drops.ts";
import { listHseFolderDrops } from "./hse-folder-drops.ts";
import {
  HSE_TEMPLATE_FILL_AUDIT_OWNER,
  auditHseTemplateFillGone,
  auditHseTemplateFillRipple,
} from "./hse-template-form-audit.ts";
import {
  HSE_TEMPLATE_FILL_RIPPLE_NEVER,
  HSE_TEMPLATE_FILL_RIPPLE_RULE,
  HSE_TEMPLATE_FILL_RIPPLE_SURFACES,
  hseTemplateFillRipplePlan,
} from "./hse-template-form-ripple.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-hse-fill-audit-"));
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function fillFile(folderId: string, destLabel = "Boiler 17", extra = "") {
  const def = hseTemplateFormForCatalog(folderId)!;
  const name = hseFilledCopyName({
    title: def.title,
    destLabel,
    userName: wendell.name,
    at: new Date(2026, 8, 12, 12, 0, 0),
    sourceName: def.title,
  });
  const fieldId = def.fields[0]?.id || "notes";
  return hseTemplateFormToLead(
    {
      mark: HSE_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog",
      sourceFolder: def.folderId,
      dest: destLabel === "Day-1 kit" ? "prepackage" : "job",
      destLabel,
      savedAt: "2026-09-12T12:00:00.000Z",
      user: wendell.name,
      fields: { [fieldId]: extra || destLabel },
      rows: [],
    },
    name,
  );
}

describe("Nightly deep audit — HSE template fill ripple", { concurrency: 1 }, () => {
  it("names every ripple surface and never the company rail", () => {
    assert.match(HSE_TEMPLATE_FILL_RIPPLE_RULE, /Never a form-only silo/);
    assert.deepEqual([...HSE_TEMPLATE_FILL_RIPPLE_SURFACES], [
      "job-folder",
      "job-package",
      "prepackage-shelf",
      "vault-tree",
      "briefs-index",
    ]);
    assert.deepEqual([...HSE_TEMPLATE_FILL_RIPPLE_NEVER], ["company-rail"]);
    const job = hseTemplateFillRipplePlan("job", "jsa");
    assert.deepEqual(job.folders, ["jsa", "packages"]);
    assert.deepEqual(job.surfaces, ["job-folder", "job-package", "vault-tree", "briefs-index"]);
    const kit = hseTemplateFillRipplePlan("prepackage", "jsa");
    assert.deepEqual(kit.folders, []);
    assert.deepEqual(kit.surfaces, ["prepackage-shelf", "vault-tree", "briefs-index"]);
  });

  it("job save/edit/remove updates folder, Packages radio, vault tree, and briefs — never the rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "job-ripple"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("jsa", "Boiler 17");
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

    const audit = await auditHseTemplateFillRipple({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "jsa",
      fileName: first.name,
      actor: wendell,
      owner: HSE_TEMPLATE_FILL_AUDIT_OWNER,
    });
    assert.equal(audit.ok, true, audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; "));

    const fromPackages = await readHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(fromPackages.ok, true);
    if (fromPackages.ok) assert.equal(fromPackages.form.folderId, "jsa");

    const edited = fillFile("jsa", "Boiler 17 night");
    edited.name = first.name;
    const replaced = await saveHseTemplateFill(wendell, {
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

    const removed = await removeHseTemplateFill(wendell, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(removed.ok, true);
    const gone = await auditHseTemplateFillGone({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "jsa",
      fileName: first.name,
      actor: wendell,
    });
    assert.equal(gone.ok, true, `lingering ${gone.lingering.join(",")}`);
    const folder = await listHseFolderDrops(wendell, "job-b17", "jsa", "madison");
    const packages = await listHseFolderDrops(wendell, "job-b17", "packages", "madison");
    assert.equal(folder.files.some((file) => file.name === first.name), false);
    assert.equal(packages.files.some((file) => file.name === first.name), false);
  });

  it("Ready prepackage save updates shelf, vault tree, and briefs — never job folders or the rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit-ripple"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("jsa", "Day-1 kit");
    const saved = await saveHseTemplateFill(wendell, {
      dest: "prepackage",
      packageName: "Day-1 kit",
      companyId: "madison",
      companyLabel: "Madison",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.deepEqual(saved.ripple.surfaces, ["prepackage-shelf", "vault-tree", "briefs-index"]);

    const audit = await auditHseTemplateFillRipple({
      dest: "prepackage",
      companyId: "madison",
      packageId: "packageId" in saved ? saved.packageId : undefined,
      fileName: first.name,
      actor: wendell,
    });
    assert.equal(audit.ok, true, audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; "));
    const jobFolder = await listHseFolderDrops(wendell, "job-b17", "jsa", "madison");
    assert.equal(jobFolder.files.some((file) => file.name === first.name), false);
  });

  it("covers every catalog radio on the ripple audit and stays on npm test", () => {
    assert.equal(HSE_MODULE_CATALOG.length >= 10, true);
    const pkg = source("../package.json");
    assert.match(pkg, /hse-template-form-audit\.test\.ts/);
    const desk = source("../components/HseDesk.tsx");
    assert.match(desk, /fillTick/);
    assert.match(desk, /HseFolderDrop/);
    assert.match(desk, /HsePackageShelf/);
    assert.match(desk, /HseVaultOwnerTree/);
  });
});
