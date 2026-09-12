/**
 * Nightly deep-audit entry for Quality always-present template fills.
 * Future Quality / vault persist ships MUST add a sibling *-audit.test.ts
 * and register it in lib/nightly-deep-audit.test.ts + package.json `test`.
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
import { QUALITY_MODULE_CATALOG } from "./quality-folders.ts";
import {
  QUALITY_TEMPLATE_FORM_MARK,
  qualityFilledCopyName,
  qualityTemplateFormForCatalog,
  qualityTemplateFormToLead,
} from "./quality-template-form.ts";
import {
  readQualityTemplateFill,
  removeQualityTemplateFill,
  saveQualityTemplateFill,
} from "./quality-template-form-drops.ts";
import { listQualityFolderDrops } from "./quality-folder-drops.ts";
import {
  QUALITY_TEMPLATE_FILL_AUDIT_OWNER,
  auditQualityTemplateFillGone,
  auditQualityTemplateFillRipple,
} from "./quality-template-form-audit.ts";
import {
  QUALITY_TEMPLATE_FILL_RIPPLE_NEVER,
  QUALITY_TEMPLATE_FILL_RIPPLE_RULE,
  QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES,
  qualityTemplateFillRipplePlan,
} from "./quality-template-form-ripple.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-fill-audit-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function fillFile(folderId: string, destLabel = "Boiler 17", extra = "") {
  const def = qualityTemplateFormForCatalog(folderId)!;
  const name = qualityFilledCopyName({
    title: def.title,
    destLabel,
    userName: chance.name,
    at: new Date(2026, 8, 12, 12, 0, 0),
    sourceName: def.title,
  });
  const fieldId = def.fields[0]?.id || "notes";
  return qualityTemplateFormToLead(
    {
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog",
      sourceFolder: def.folderId,
      dest: destLabel === "Day-1 kit" ? "prepackage" : "job",
      destLabel,
      savedAt: "2026-09-12T12:00:00.000Z",
      user: chance.name,
      fields: { [fieldId]: extra || destLabel },
      rows: [],
    },
    name,
  );
}

describe("Nightly deep audit — Quality template fill ripple", { concurrency: 1 }, () => {
  it("names every ripple surface and never the company rail", () => {
    assert.match(QUALITY_TEMPLATE_FILL_RIPPLE_RULE, /Never a form-only silo/);
    assert.deepEqual([...QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES], [
      "job-folder",
      "job-package",
      "prepackage-shelf",
      "vault-tree",
      "briefs-index",
    ]);
    assert.deepEqual([...QUALITY_TEMPLATE_FILL_RIPPLE_NEVER], ["company-rail"]);
    const job = qualityTemplateFillRipplePlan("job", "flange-log");
    assert.deepEqual(job.folders, ["flange-log", "packages"]);
    assert.deepEqual(job.surfaces, ["job-folder", "job-package", "vault-tree", "briefs-index"]);
    const kit = qualityTemplateFillRipplePlan("prepackage", "flange-log");
    assert.deepEqual(kit.folders, []);
    assert.deepEqual(kit.surfaces, ["prepackage-shelf", "vault-tree", "briefs-index"]);
  });

  it("job save/edit/remove updates folder, Packages radio, vault tree, and briefs — never the rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "job-ripple"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("flange-log", "Boiler 17");
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
    assert.ok(saved.ripple);
    assert.deepEqual(saved.ripple.surfaces, ["job-folder", "job-package", "vault-tree", "briefs-index"]);

    const audit = await auditQualityTemplateFillRipple({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      actor: chance,
      owner: QUALITY_TEMPLATE_FILL_AUDIT_OWNER,
    });
    assert.equal(audit.ok, true, audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; "));

    const fromPackages = await readQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(fromPackages.ok, true);
    if (fromPackages.ok) assert.equal(fromPackages.form.fields.job, "Boiler 17");

    const edited = fillFile("flange-log", "Boiler 17 night");
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
    const againFolder = await readQualityTemplateFill(chance, {
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
    assert.equal(againFolder.ok, true);
    assert.equal(againPackage.ok, true);
    if (againFolder.ok) assert.equal(againFolder.form.fields.job, "Boiler 17 night");
    if (againPackage.ok) assert.equal(againPackage.form.fields.job, "Boiler 17 night");

    const afterEdit = await auditQualityTemplateFillRipple({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      actor: chance,
    });
    assert.equal(afterEdit.ok, true);

    const removed = await removeQualityTemplateFill(chance, {
      dest: "job",
      jobId: "job-b17",
      folderId: "packages",
      fileName: first.name,
      companyId: "madison",
    });
    assert.equal(removed.ok, true);
    const gone = await auditQualityTemplateFillGone({
      dest: "job",
      companyId: "madison",
      jobId: "job-b17",
      folderId: "flange-log",
      fileName: first.name,
      actor: chance,
    });
    assert.equal(gone.ok, true, `lingering ${gone.lingering.join(",")}`);
    const folder = await listQualityFolderDrops(chance, "job-b17", "flange-log", "madison");
    const packages = await listQualityFolderDrops(chance, "job-b17", "packages", "madison");
    assert.equal(folder.files.some((file) => file.name === first.name), false);
    assert.equal(packages.files.some((file) => file.name === first.name), false);
  });

  it("Ready prepackage save updates shelf, vault tree, and briefs — never job folders or the rail", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "kit-ripple"));
    useLeadBriefVaultForTests(drive);
    const first = fillFile("flange-log", "Day-1 kit");
    const saved = await saveQualityTemplateFill(chance, {
      dest: "prepackage",
      packageName: "Day-1 kit",
      companyId: "madison",
      companyLabel: "Madison",
      files: [first],
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.deepEqual(saved.ripple.surfaces, ["prepackage-shelf", "vault-tree", "briefs-index"]);

    const audit = await auditQualityTemplateFillRipple({
      dest: "prepackage",
      companyId: "madison",
      jobId: saved.jobId,
      packageId: saved.packageId,
      folderId: "packages",
      fileName: first.name,
      actor: chance,
    });
    assert.equal(audit.ok, true, audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; "));

    const jobFolder = await listQualityFolderDrops(chance, "job-b17", "flange-log", "madison");
    const jobPackage = await listQualityFolderDrops(chance, "job-b17", "packages", "madison");
    assert.equal(jobFolder.files.some((file) => file.name === first.name), false);
    assert.equal(jobPackage.files.some((file) => file.name === first.name), false);
  });

  it("every catalog radio job save ripples onto the job Packages radio", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "all-radios-ripple"));
    useLeadBriefVaultForTests(drive);
    for (const radio of QUALITY_MODULE_CATALOG) {
      const file = fillFile(radio.id, "Boiler 17", radio.id);
      const saved = await saveQualityTemplateFill(chance, {
        dest: "job",
        jobId: "job-b17",
        folderId: radio.id,
        companyId: "madison",
        companyLabel: "Madison",
        siteLabel: "Wood River",
        jobLabel: "Boiler 17",
        files: [file],
      });
      assert.equal(saved.ok, true, radio.id);
      if (!saved.ok) continue;
      const audit = await auditQualityTemplateFillRipple({
        dest: "job",
        companyId: "madison",
        jobId: "job-b17",
        folderId: radio.id,
        fileName: file.name,
        actor: chance,
      });
      assert.equal(audit.ok, true, `${radio.id}: ${audit.checks.filter((check) => !check.ok).map((check) => check.note).join("; ")}`);
    }
  });

  it("desk remounts every listing after save and the nightly registry stays wired", () => {
    const desk = source("../components/QualityDesk.tsx");
    const tree = source("../components/QualityVaultOwnerTree.tsx");
    const route = source("../app/api/desk/briefs/route.ts");
    const pkg = source("../package.json");
    assert.match(desk, /key=\{`shelf-\$\{fillTick\}`\}/);
    assert.match(desk, /QualityVaultOwnerTree/);
    assert.match(desk, /refresh=\{fillTick\}/);
    assert.match(desk, /key=\{`vault-\$\{fillTick\}`\}/);
    assert.match(desk, /fillTick/);
    assert.match(desk, /vaultCompanyId, fillTick\]/);
    assert.match(tree, /refresh/);
    assert.match(route, /ripple: result\.ripple/);
    assert.match(pkg, /quality-template-form-audit\.test\.ts/);
    assert.match(pkg, /nightly-deep-audit\.test\.ts/);
  });
});
