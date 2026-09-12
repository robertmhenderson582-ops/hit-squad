import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HSE_COMPANY_DOC_CATALOG } from "./hse-company-docs.ts";
import { hseCompanyDocAcl } from "./hse-company-doc-acl.ts";
import { HSE_MODULE_CATALOG } from "./hse-folders.ts";
import { hsePackageShelfAcl } from "./hse-package-shelf.ts";
import {
  HSE_TEMPLATE_FORM_MARK,
  MADISON_JSA_TITLE,
  addHseTemplateRow,
  emptyHseTemplateFormRecord,
  hydrateHseTemplateFormRecord,
  hseAlwaysDisplayedTemplateCount,
  hseAlwaysDisplayedTemplates,
  hseFilledCopyCollidesWithTemplate,
  hseFilledCopyName,
  hseTemplateCanSave,
  hseTemplateCatalogIds,
  hseTemplateCompanyDocIds,
  hseTemplateFillAcl,
  hseTemplateFormDef,
  hseTemplateFormDefFromFilledName,
  hseTemplateFormForCatalog,
  hseTemplateFormForCompanyDoc,
  hseTemplateFormFromLead,
  hseTemplateFormHasWork,
  hseTemplateFormToLead,
  isHseFilledCopyName,
  isHseFilledCopyText,
  isMadisonJsaForm,
  parseHseTemplateForm,
  patchHseTemplateField,
  serializeHseTemplateForm,
} from "./hse-template-form.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const wendell = { email: "wlanderno@yahoo.com", name: "Wendell", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const chance = { email: "chancec318@yahoo.com", name: "Chance", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

describe("HSE always-displayed template forms", () => {
  it("covers every left-rail safety bar and every catalog radio", () => {
    assert.equal(hseTemplateCompanyDocIds().length, HSE_COMPANY_DOC_CATALOG.length);
    assert.equal(hseTemplateCatalogIds().length, HSE_MODULE_CATALOG.length);
    assert.equal(hseAlwaysDisplayedTemplateCount(), HSE_COMPANY_DOC_CATALOG.length + HSE_MODULE_CATALOG.length);
    assert.equal(hseAlwaysDisplayedTemplates().length, hseAlwaysDisplayedTemplateCount());
    for (const doc of HSE_COMPANY_DOC_CATALOG) {
      const def = hseTemplateFormForCompanyDoc(doc.id);
      assert.ok(def, doc.id);
      assert.ok(def.title);
      assert.ok(def.folderId);
    }
    for (const radio of HSE_MODULE_CATALOG) {
      const def = hseTemplateFormForCatalog(radio.id);
      assert.ok(def, radio.id);
      assert.equal(def.folderId, radio.id);
    }
    assert.equal(hseTemplateFormForCatalog("jsa")?.title, MADISON_JSA_TITLE);
    assert.equal(isMadisonJsaForm(hseTemplateFormForCatalog("jsa")), true);
    assert.equal(isMadisonJsaForm(hseTemplateFormForCompanyDoc("jsas")), true);
    assert.equal(hseTemplateFormDef({ source: "catalog", folderId: "toolbox" })?.id, "toolbox");
    assert.equal(hseTemplateFormDef({ source: "company-docs", folderId: "safety-manual" })?.id, "safety-manual");
  });

  it("names a filled copy distinctly and never collides with the rail template", () => {
    const named = hseFilledCopyName({
      title: MADISON_JSA_TITLE,
      destLabel: "Boiler 17",
      userName: "Wendell Landerno",
      at: new Date(2026, 8, 12, 12, 0, 0),
      sourceName: "Madison JSA.pdf",
    });
    assert.equal(named, "Madison JSA — Boiler 17 — 2026-09-12 — Wendell Landerno.txt");
    assert.equal(isHseFilledCopyName(named), true);
    assert.equal(hseFilledCopyCollidesWithTemplate(named, "Madison JSA.pdf"), false);
    assert.equal(isHseFilledCopyName("Madison JSA.pdf"), false);
    const fromName = hseTemplateFormDefFromFilledName(named);
    assert.equal(fromName?.id, "jsa");
  });

  it("round-trips filled text and keeps empty work off save", () => {
    const def = hseTemplateFormForCatalog("jsa")!;
    let record = emptyHseTemplateFormRecord(def);
    assert.equal(hseTemplateFormHasWork(record), false);
    record = patchHseTemplateField(record, "task", "Hot work at piperack");
    record = addHseTemplateRow(record, "row-1");
    record = hydrateHseTemplateFormRecord({ fields: record.fields, rows: record.rows }, def);
    assert.equal(hseTemplateFormHasWork(record), true);
    const payload = {
      mark: HSE_TEMPLATE_FORM_MARK,
      id: def.id,
      title: def.title,
      folderId: def.folderId,
      source: "catalog" as const,
      dest: "job" as const,
      destLabel: "Boiler 17",
      savedAt: "2026-09-12T12:00:00.000Z",
      user: "Wendell",
      fields: record.fields,
      rows: record.rows,
    };
    const text = serializeHseTemplateForm(payload);
    assert.equal(isHseFilledCopyText(text), true);
    const parsed = parseHseTemplateForm(text);
    assert.equal(parsed?.fields.task, "Hot work at piperack");
    const lead = hseTemplateFormToLead(payload, "Madison JSA — Boiler 17 — 2026-09-12 — Wendell.txt");
    assert.equal(hseTemplateFormFromLead(lead)?.fields.task, "Hot work at piperack");
  });

  it("gates save dest by seat: HSE both, PM job only, viewer none", () => {
    const ownerAcl = hseTemplateFillAcl(hseCompanyDocAcl(owner), hsePackageShelfAcl(owner));
    const hseAcl = hseTemplateFillAcl(hseCompanyDocAcl(wendell), hsePackageShelfAcl(wendell));
    const pmAcl = hseTemplateFillAcl(hseCompanyDocAcl(nathan), hsePackageShelfAcl(nathan));
    const viewerAcl = hseTemplateFillAcl(hseCompanyDocAcl(chance), hsePackageShelfAcl(chance));
    assert.equal(ownerAcl.canSaveJob && ownerAcl.canSavePrepackage, true);
    assert.equal(hseAcl.canSaveJob && hseAcl.canSavePrepackage, true);
    assert.equal(hseAcl.canEditJsaTemplate, true);
    assert.equal(pmAcl.canSaveJob, true);
    assert.equal(pmAcl.canSavePrepackage, false);
    assert.equal(hseTemplateCanSave(pmAcl, "prepackage"), false);
    assert.equal(viewerAcl.readOnly, true);
    assert.equal(hseTemplateCanSave(viewerAcl, "job"), false);
  });

  it("wires Open form, Madison JSA print, and Edit on the JSAs rail", () => {
    const desk = source("../components/HseDesk.tsx");
    const form = source("../components/HseTemplateForm.tsx");
    const rail = source("../components/HseCompanyDocRail.tsx");
    assert.match(desk, /HseTemplateForm/);
    assert.match(desk, /Open form/);
    assert.match(form, /Print Madison JSA/);
    assert.match(form, /isMadisonJsaForm/);
    assert.match(form, /window\.print/);
    assert.match(rail, />Edit</);
    assert.match(rail, /canEditJsaTemplate/);
    assert.doesNotMatch(form, /@gmail.com|tester email|madisonltd\.com/i);
    assert.doesNotMatch(desk, /Inbox|Suggestion Box/);
  });
});
