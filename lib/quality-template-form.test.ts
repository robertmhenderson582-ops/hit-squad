import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { QUALITY_COMPANY_DOC_CATALOG } from "./quality-company-docs.ts";
import { qualityCompanyDocAcl } from "./quality-company-doc-acl.ts";
import { QUALITY_MODULE_CATALOG } from "./quality-folders.ts";
import { qualityPackageShelfAcl } from "./quality-package-shelf.ts";
import {
  QUALITY_TEMPLATE_FORM_MARK,
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
  qualityTemplateCatalogIds,
  qualityTemplateCompanyDocIds,
  qualityTemplateFillAcl,
  qualityTemplateFormDef,
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
    assert.match(rail, /onOpenForm/);
    assert.match(rail, /Open form/);
    assert.match(viewer, /Open form/);
    assert.doesNotMatch(viewer, /Open \/ download/);
    assert.match(form, /Save to a job/);
    assert.match(form, /prepackage/);
    assert.match(form, /Ready prepackage/);
    assert.match(drop, /onOpenFilled/);
    assert.match(shelf, /onOpenFilled/);
    assert.match(route, /template-fill/);
    assert.match(route, /ripple: result\.ripple/);
    assert.match(desk, /key=\{`shelf-\$\{fillTick\}`\}/);
    assert.match(desk, /refresh=\{fillTick\}/);
    assert.match(desk, /key=\{`vault-\$\{fillTick\}`\}/);
    assert.doesNotMatch(form, /@gmail\.com|tester email/i);
    assert.doesNotMatch(desk, /inbox|suggestion box/i);
  });
});
