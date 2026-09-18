import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { QUALITY_COMPANY_DOC_CATALOG } from "./quality-company-docs.ts";
import { qualityCompanyDocAcl } from "./quality-company-doc-acl.ts";
import { QUALITY_MODULE_CATALOG } from "./quality-folders.ts";
import { qualityPackageShelfAcl } from "./quality-package-shelf.ts";
import {
  QUALITY_TEMPLATE_FILL_MISSING_ERROR,
  QUALITY_TEMPLATE_FILL_OPEN_TIMEOUT_ERROR,
  QUALITY_TEMPLATE_FORM_MARK,
  qualityTemplateFillOpenNote,
  addQualityTemplateRow,
  emptyQualityTemplateFormRecord,
  hydrateQualityTemplateFormRecord,
  isQualityFilledCopyName,
  isQualityFilledCopyText,
  matchQualityPackageForm,
  parseQualityTemplateForm,
  patchQualityTemplateField,
  patchQualityTemplateRow,
  qualityAlwaysDisplayedTemplateCount,
  qualityAlwaysDisplayedTemplates,
  qualityFilledCopyCollidesWithTemplate,
  qualityFilledCopyName,
  qualityTemplateCanSave,
  qualityTemplateFormViewOnly,
  qualityTemplateCatalogIds,
  qualityTemplateCompanyDocIds,
  qualityTemplateFillAcl,
  qualityTemplateFormDef,
  qualityTemplateFormDefFromFilledName,
  qualityTemplateFormForCatalog,
  qualityTemplateFormForCompanyDoc,
  qualityTemplateFormFromLead,
  qualityTemplateFormHasWork,
  qualityTemplateFormToLead,
  serializeQualityTemplateForm,
  type QualityTemplateFormPayload,
} from "./quality-template-form.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const chance = { email: "chancec318@yahoo.com", name: "Chance", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

describe("Quality always-displayed template forms", () => {
  it("covers every left-rail company doc and every catalog radio", () => {
    assert.equal(qualityTemplateCompanyDocIds().length, QUALITY_COMPANY_DOC_CATALOG.length);
    assert.equal(qualityTemplateCatalogIds().length, QUALITY_MODULE_CATALOG.length);
    assert.equal(qualityAlwaysDisplayedTemplateCount(), QUALITY_COMPANY_DOC_CATALOG.length + QUALITY_MODULE_CATALOG.length);
    assert.equal(qualityAlwaysDisplayedTemplates().length, qualityAlwaysDisplayedTemplateCount());
    for (const doc of QUALITY_COMPANY_DOC_CATALOG) {
      const def = qualityTemplateFormForCompanyDoc(doc.id);
      assert.ok(def, doc.id);
      assert.ok(def.title);
      assert.ok(def.folderId);
    }
    for (const radio of QUALITY_MODULE_CATALOG) {
      const def = qualityTemplateFormForCatalog(radio.id);
      assert.ok(def, radio.id);
      assert.equal(def.folderId, radio.id);
      assert.equal(def.title, radio.label);
    }
  });

  it("maps Forms bucket files onto Chance’s 2.7.x sheets and leaves unknown forms generic", () => {
    assert.equal(matchQualityPackageForm("2.7.19 Madison Flange Log Rev.1.pdf"), "2.7.19");
    assert.equal(qualityTemplateFormForCompanyDoc("forms", "2.7.19 Madison Flange Log Rev.1.pdf")?.folderId, "flange-log");
    assert.equal(qualityTemplateFormForCompanyDoc("forms", "2.7.34 Job Completion Sign-off Form Rev 2.pdf")?.id, "2.7.34");
    assert.equal(qualityTemplateFormForCompanyDoc("forms", "NDE req spreadsheet.xlsx")?.folderId, "nde-request");
    assert.equal(qualityTemplateFormForCompanyDoc("forms", "blank-cover.pdf")?.id, "forms");
    assert.equal(qualityTemplateFormDef({ source: "catalog", folderId: "weld-log" })?.id, "weld-log");
    assert.equal(qualityTemplateFormDef({ source: "company-docs", folderId: "quality-control-manual" })?.id, "quality-control-manual");
  });

  it("names a filled copy distinctly and never collides with the rail template", () => {
    const named = qualityFilledCopyName({
      title: "Flange Log",
      destLabel: "Boiler 17",
      userName: "Chance Middlebrooks",
      at: new Date(2026, 8, 12, 12, 0, 0),
      sourceName: "2.7.19 Madison Flange Log Rev.1.pdf",
    });
    assert.equal(named, "Flange Log — Boiler 17 — 2026-09-12 — Chance Middlebrooks.txt");
    assert.equal(isQualityFilledCopyName(named), true);
    assert.equal(qualityFilledCopyCollidesWithTemplate(named, "2.7.19 Madison Flange Log Rev.1.pdf"), false);
    assert.equal(isQualityFilledCopyName("2.7.19 Madison Flange Log Rev.1.pdf"), false);
    const forced = qualityFilledCopyName({
      title: "Same",
      destLabel: "Same",
      userName: "Same",
      at: new Date(2026, 8, 12, 12, 0, 0),
      sourceName: "Same — Same — 2026-09-12 — Same.txt",
    });
    assert.match(forced, /filled\.txt$/);
    assert.equal(qualityFilledCopyCollidesWithTemplate("2.7.19.pdf", "2.7.19.pdf"), true);
  });

  it("round-trips fill → serialize → parse → edit values", () => {
    const def = qualityTemplateFormForCatalog("flange-log");
    assert.ok(def);
    let record = emptyQualityTemplateFormRecord(def);
    assert.equal(qualityTemplateFormHasWork(record), false);
    record = patchQualityTemplateField(record, "job", "Boiler 17");
    record = addQualityTemplateRow(record, "row-1");
    record = patchQualityTemplateRow(record, "row-1", "flangeId", "F-12");
    record = patchQualityTemplateRow(record, "row-1", "location", "Area A");
    assert.equal(qualityTemplateFormHasWork(record), true);
    const payload: QualityTemplateFormPayload = {
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog" as const,
      sourceFolder: "flange-log",
      sourceName: "",
      dest: "job" as const,
      destLabel: "Boiler 17",
      savedAt: "2026-09-12T12:00:00.000Z",
      user: "Chance",
      fields: record.fields,
      rows: record.rows,
    };
    const text = serializeQualityTemplateForm(payload);
    assert.equal(isQualityFilledCopyText(text), true);
    const parsed = parseQualityTemplateForm(text);
    assert.ok(parsed);
    assert.equal(parsed.fields.job, "Boiler 17");
    assert.equal(parsed.rows[0]?.cells.flangeId, "F-12");
    const lead = qualityTemplateFormToLead(payload, "Flange Log — Boiler 17 — 2026-09-12 — Chance.txt");
    const fromLead = qualityTemplateFormFromLead(lead);
    assert.ok(fromLead);
    assert.equal(fromLead.fields.job, "Boiler 17");
    const edited = hydrateQualityTemplateFormRecord(
      { fields: { ...fromLead.fields, job: "Boiler 17 night" }, rows: fromLead.rows },
      def,
    );
    assert.equal(edited.fields.job, "Boiler 17 night");
    assert.equal(edited.rows[0]?.cells.location, "Area A");
  });

  it("keeps viewers read-only and lets Quality / PM seats save", () => {
    const quality = qualityTemplateFillAcl(qualityCompanyDocAcl(chance), qualityPackageShelfAcl(chance));
    assert.equal(quality.canSaveJob, true);
    assert.equal(quality.canSavePrepackage, true);
    assert.equal(quality.readOnly, false);
    assert.equal(qualityTemplateCanSave(quality, "prepackage"), true);
    const pm = qualityTemplateFillAcl(qualityCompanyDocAcl(nathan), qualityPackageShelfAcl(nathan));
    assert.equal(pm.canSaveJob, true);
    assert.equal(pm.canSavePrepackage, false);
    assert.equal(qualityTemplateCanSave(pm, "job"), true);
    assert.equal(qualityTemplateCanSave(pm, "prepackage"), false);
    const viewer = qualityTemplateFillAcl(qualityCompanyDocAcl(wendell), qualityPackageShelfAcl(wendell));
    assert.equal(viewer.readOnly, true);
    assert.equal(viewer.canSaveJob, false);
    assert.equal(viewer.canSavePrepackage, false);
    const ownerAcl = qualityTemplateFillAcl(qualityCompanyDocAcl(owner), qualityPackageShelfAcl(owner));
    assert.equal(ownerAcl.canSaveJob, true);
    assert.equal(ownerAcl.canSavePrepackage, true);
    assert.equal(qualityTemplateFormViewOnly(ownerAcl, owner), false);
    assert.equal(qualityTemplateFormViewOnly(ownerAcl, wendell), true);
    assert.equal(qualityTemplateFormViewOnly(viewer, owner), true);
    const form = source("../components/QualityTemplateForm.tsx");
    const fields = source("../components/DeskTemplateFormFields.tsx");
    const drop = source("../components/QualityFolderDrop.tsx");
    const desk = source("../components/QualityDesk.tsx");
    const shelf = source("../components/QualityPackageShelf.tsx");
    assert.match(form, /viewOnly = qualityTemplateFormViewOnly\(fillAcl, lens\)/);
    assert.match(form, /useLensUser/);
    assert.match(desk, /useLensUser/);
    assert.match(desk, /qualityTemplateFillAcl\(qualityCompanyDocAcl\(actor\)/);
    assert.match(form, /DeskTemplateFieldInput/);
    assert.match(fields, /paper-field-view/);
    assert.match(fields, /disabled=\{viewOnly\}/);
    assert.match(fields, /No rows on this form/);
    assert.match(fields, /\+ Add row/);
    assert.match(drop, /canMutate/);
    assert.match(desk, /canMutate=\{fillAcl.canSaveJob\}/);
    assert.match(shelf, /View only\. Open a filled copy/);
    assert.doesNotMatch(shelf, /if \(!acl.canBuild && !acl.canAttach\) return null/);
  });

  it("locks Open form on every always-displayed radio and the company rail", () => {
    const desk = source("../components/QualityDesk.tsx");
    const rail = source("../components/QualityCompanyDocRail.tsx");
    const viewer = source("../components/QualityCompanyDocViewer.tsx");
    const form = source("../components/QualityTemplateForm.tsx");
    const drop = source("../components/QualityFolderDrop.tsx");
    const shelf = source("../components/QualityPackageShelf.tsx");
    const route = source("../app/api/desk/briefs/route.ts");
    assert.match(desk, /QualityTemplateForm/);
    assert.match(desk, /openTemplateForm/);
    assert.match(desk, /Open form/);
    assert.match(desk, /DeskCatalogRadios/);
    assert.doesNotMatch(desk, /<button[\s\S]{0,240}Open form/);
    assert.match(rail, /onOpenForm/);
    assert.match(rail, /Open form/);
    assert.match(viewer, /Open form/);
    assert.doesNotMatch(viewer, /Open \/ download/);
    assert.match(form, /Save to a job/);
    assert.match(form, /prepackage/);
    assert.match(form, /Ready prepackage/);
    assert.match(drop, /onOpenFilled/);
    assert.match(drop, /Open filled copy/);
    assert.match(drop, /folderId === "packages" \? \[folderId\] : \[folderId, "packages"/);
    assert.match(desk, /setRadio\("packages"\)/);
    assert.match(desk, /dest: "prepackage"/);
    assert.match(desk, /dest: "job"/);
    assert.match(desk, /folderId: radio/);
    assert.match(desk, /destJobLabel: selectedJob/);
    assert.match(form, /session\.destJobLabel/);
    assert.match(form, /packageName=\$\{encodeURIComponent\(session\.destPackageName\)\}/);
    assert.match(form, /destKind === "prepackage" \? "packages"/);
    assert.match(shelf, /onOpenFilled/);
    assert.match(route, /template-fill/);
    assert.match(route, /packageName: params.get\("packageName"\)/);
    assert.match(route, /ripple: result\.ripple/);
    assert.match(desk, /key=\{`shelf-\$\{fillTick\}`\}/);
    assert.match(desk, /refresh=\{fillTick\}/);
    assert.match(desk, /key=\{`vault-\$\{fillTick\}`\}/);
    assert.equal(qualityTemplateFillOpenNote({ timedOut: true }), QUALITY_TEMPLATE_FILL_OPEN_TIMEOUT_ERROR);
    assert.equal(qualityTemplateFillOpenNote({ status: 404 }), QUALITY_TEMPLATE_FILL_MISSING_ERROR);
    assert.equal(qualityTemplateFillOpenNote({ error: "Filled copy not found." }), "Filled copy not found.");
    assert.match(form, /QUALITY_TEMPLATE_FILL_EMPTY_ERROR/);
    assert.match(form, /qualityTemplateFormHasWork\(record\)/);
    assert.match(form, /session.fileName \|\| session.filledName/);
    assert.match(form, /fetchJsonWithDeadline/);
    assert.match(form, /QUALITY_TEMPLATE_FILL_SAVE_DEADLINE_MS/);
    assert.match(form, /QUALITY_TEMPLATE_FILL_OPEN_DEADLINE_MS/);
    assert.match(form, /qualityTemplateFillOpenNote/);
    assert.match(form, /QUALITY_VAULT_WRITE_TIMEOUT_ERROR/);
    assert.match(form, /setSaving\(false\);\s*setLoading\(false\)/);
    assert.match(form, /hydrateQualityTemplateFormRecord/);
    assert.doesNotMatch(form, /@gmail\.com|tester email/i);
    assert.doesNotMatch(desk, /inbox|suggestion box/i);
  });

  it("feeds a filled copy back out on the home sheet even when listed under Packages", () => {
    const named = qualityFilledCopyName({
      title: "Flange Log",
      destLabel: "Boiler 17",
      userName: "Chance Middlebrooks",
      at: new Date(2026, 8, 12, 12, 0, 0),
    });
    const fromPackages = qualityTemplateFormDef({
      source: "catalog",
      folderId: "packages",
      fileName: named,
    });
    assert.equal(fromPackages?.folderId, "flange-log");
    assert.equal(qualityTemplateFormDefFromFilledName(named)?.id, "flange-log");
    assert.equal(qualityTemplateFormHasWork({ fields: {}, rows: [] }), false);
    assert.equal(qualityTemplateFormHasWork({ fields: { job: "   " }, rows: [] }), false);
    assert.equal(qualityTemplateFormHasWork({ fields: { job: "Boiler 17" }, rows: [] }), true);
  });

  it("Packages filled-copy parse keeps header keys even if the JSON id is wrong", () => {
    const def = qualityTemplateFormForCatalog("packages");
    assert.ok(def);
    const named = qualityFilledCopyName({
      title: def.title,
      destLabel: "Madison CAT 2 (Pit Stop)",
      userName: "Robert Henderson",
      at: new Date(2026, 8, 17, 20, 42, 0),
    });
    assert.equal(qualityTemplateFormDefFromFilledName(named)?.id, "packages");
    assert.equal(qualityTemplateFormDef({ source: "catalog", folderId: "packages", fileName: named })?.id, "packages");
    const payload: QualityTemplateFormPayload = {
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: "forms",
      title: "Forms",
      folderId: "packages",
      source: "catalog",
      sourceFolder: "packages",
      sourceName: "",
      dest: "job",
      destLabel: "Madison CAT 2 (Pit Stop)",
      savedAt: "2026-09-17T20:42:00.000Z",
      user: "Robert Henderson",
      fields: {
        packageName: "CAT 2 night pack",
        revision: "Rev A",
        preparedBy: "Robert Henderson",
        contents: "Cover + weld log",
        notes: "AUDIT-2026-09-17-NIGHT",
      },
      rows: [],
    };
    const parsed = parseQualityTemplateForm(serializeQualityTemplateForm(payload), named);
    assert.ok(parsed);
    assert.equal(parsed.fields.packageName, "CAT 2 night pack");
    assert.equal(parsed.fields.notes, "AUDIT-2026-09-17-NIGHT");
    const fromLead = qualityTemplateFormFromLead(qualityTemplateFormToLead(payload, named));
    assert.ok(fromLead);
    assert.equal(fromLead.fields.contents, "Cover + weld log");
    const formsDef = qualityTemplateFormForCompanyDoc("forms");
    assert.ok(formsDef);
    const extras = hydrateQualityTemplateFormRecord({ fields: payload.fields, rows: [] }, formsDef);
    assert.equal(extras.fields.notes, "AUDIT-2026-09-17-NIGHT");
    assert.equal(extras.fields.packageName, "CAT 2 night pack");
    const client = hydrateQualityTemplateFormRecord(extras, def);
    assert.equal(client.fields.packageName, "CAT 2 night pack");
    assert.equal(client.fields.revision, "Rev A");
  });
});
