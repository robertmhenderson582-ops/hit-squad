import {
  HSE_COMPANY_DOC_CATALOG,
  isHseCompanyDocId,
  hseCompanyDocFileName,
  hseCompanyDocLabel,
  type HseCompanyDocId,
} from "./hse-company-docs.ts";
import type { HseCompanyDocAcl } from "./hse-company-doc-acl.ts";
import { HSE_EXECUTE_LANES } from "./hse-module.ts";
import {
  HSE_MODULE_CATALOG,
  isHseFolderId,
  hseFolderLabel,
  resolveHseFolder,
  type HseFolderId,
} from "./hse-folders.ts";
import type { HsePackageShelfAcl } from "./hse-package-shelf.ts";
import type { QualityFieldDef } from "./quality-day1.ts";
import { emptyRegisterRow, hydrateRegisterRows, type ModuleRegisterRow } from "./register-rows.ts";

/** Magic first line. Filled copies round-trip; blank rail templates never use this mark. */
export const HSE_TEMPLATE_FORM_MARK = "HS-HSE-FORM v1";
export const HSE_TEMPLATE_FILL_TYPE = "text/plain";
export const HSE_TEMPLATE_FILL_EXT = ".txt";
export const HSE_TEMPLATE_FILL_SCOPE = "template-fill";

export const HSE_TEMPLATE_FILL_VIEW_ERROR = "View only — this form cannot be saved from this seat.";
export const HSE_TEMPLATE_FILL_TEMPLATE_ERROR =
  "The always-present template stays blank. Save the filled copy under a different name.";
export const HSE_TEMPLATE_FILL_DEST_ERROR =
  "Pick a job or a Ready prepackage. The company rail is not a save destination.";
export const HSE_TEMPLATE_FILL_JOB_ERROR = "Pick a job for this filled copy.";
export const HSE_TEMPLATE_FILL_PREPACKAGE_ERROR = "Pick or name a Ready prepackage for this filled copy.";
export const HSE_TEMPLATE_FILL_EMPTY_ERROR = "Fill the form before saving a copy.";

export const MADISON_JSA_TITLE = "Madison JSA";

export type HseTemplateSourceKind = "company-docs" | "catalog";
export type HseTemplateFillDest = "job" | "prepackage";

export type HseTemplateFormDef = {
  id: string;
  title: string;
  folderId: HseFolderId;
  fields: readonly QualityFieldDef[];
  rowFields: readonly QualityFieldDef[];
  hint?: string;
  print?: boolean;
};

export type HseTemplateFormRecord = {
  fields: Record<string, string>;
  rows: ModuleRegisterRow[];
};

export type HseTemplateFormPayload = {
  mark: typeof HSE_TEMPLATE_FORM_MARK;
  id: string;
  title: string;
  folderId: HseFolderId;
  source: HseTemplateSourceKind;
  sourceFolder?: string;
  sourceName?: string;
  dest: HseTemplateFillDest;
  destLabel: string;
  savedAt: string;
  user: string;
  fields: Record<string, string>;
  rows: ModuleRegisterRow[];
};

export type HseTemplateFillAcl = {
  canOpen: boolean;
  canSaveJob: boolean;
  canSavePrepackage: boolean;
  canEditJsaTemplate: boolean;
  readOnly: boolean;
};

const COMPANY_DOC_FOLDER: Record<HseCompanyDocId, HseFolderId> = {
  "safety-manual": "packages",
  jsas: "jsa",
  forms: "packages",
  "hse-updates": "packages",
};

function laneFields(laneId: string): readonly QualityFieldDef[] {
  const lane = HSE_EXECUTE_LANES.find((row) => row.id === laneId);
  return (lane?.fields ?? []).map((field) => ({
    id: field.id,
    label: field.label,
    kind: field.kind === "date" ? "date" : "text",
  }));
}

function laneForm(folderId: HseFolderId, title: string, hint?: string, print = false): HseTemplateFormDef {
  return {
    id: folderId,
    title,
    folderId,
    fields: [
      { id: "job", label: "Job" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: laneFields(folderId),
    hint,
    print,
  };
}

const CATALOG_FORMS: Record<HseFolderId, HseTemplateFormDef> = {
  packages: {
    id: "packages",
    title: "Packages",
    folderId: "packages",
    fields: [
      { id: "packageName", label: "Package" },
      { id: "revision", label: "Revision" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
      { id: "contents", label: "Contents" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "item", label: "Item" },
      { id: "rev", label: "Rev" },
      { id: "status", label: "Status" },
    ],
    hint: "HSE kit cover. The blank catalog radio stays on the desk.",
  },
  orientation: {
    id: "orientation",
    title: "Site orientation",
    folderId: "orientation",
    fields: [
      { id: "job", label: "Job" },
      { id: "site", label: "Site" },
      { id: "date", label: "Date", kind: "date" },
      { id: "status", label: "Status" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "name", label: "Name" },
      { id: "crew", label: "Crew" },
      { id: "completed", label: "Completed", kind: "date" },
    ],
  },
  jsa: {
    id: "jsa",
    title: MADISON_JSA_TITLE,
    folderId: "jsa",
    fields: [
      { id: "job", label: "Job" },
      { id: "task", label: "Task" },
      { id: "crew", label: "Crew" },
      { id: "date", label: "Date", kind: "date" },
      { id: "status", label: "Status" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: laneFields("jsa").length
      ? laneFields("jsa")
      : [
          { id: "task", label: "Task" },
          { id: "crew", label: "Crew" },
          { id: "date", label: "Date", kind: "date" },
          { id: "status", label: "Status" },
        ],
    hint: "Madison JSA print. Edit changes the JSA template structure for authorized HSE seats when the library is unlocked. Filled copies never overwrite the blank template.",
    print: true,
  },
  toolbox: laneForm("toolbox", "Toolbox talk", "Toolbox talks you can add rows to."),
  "hot-work": laneForm("hot-work", "Hot work", "Field permit — not a plant permit office."),
  confined: laneForm("confined", "Confined space", "Field permit — not a plant permit office."),
  loto: laneForm("loto", "LOTO", "Field permit — not a plant permit office."),
  excavation: laneForm("excavation", "Excavation", "Field permit — not a plant permit office."),
  incidents: laneForm("incidents", "Incidents / near misses", "No invented hours."),
  observations: laneForm("observations", "Observations", "No invented hours."),
};

const COMPANY_DOC_FORMS: Record<HseCompanyDocId, HseTemplateFormDef> = {
  "safety-manual": {
    id: "safety-manual",
    title: "Madison Safety Manual",
    folderId: COMPANY_DOC_FOLDER["safety-manual"],
    fields: [
      { id: "document", label: "Document" },
      { id: "revision", label: "Revision" },
      { id: "job", label: "Job" },
      { id: "reviewedBy", label: "Reviewed by" },
      { id: "reviewDate", label: "Review date", kind: "date" },
      { id: "acknowledged", label: "Acknowledged", kind: "yesno" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "section", label: "Section / SOP" },
      { id: "finding", label: "Finding / note" },
    ],
    hint: "Fill a review copy. The blank Madison Safety Manual / HES SOPs bar stays on the left rail.",
  },
  jsas: {
    id: "jsas",
    title: MADISON_JSA_TITLE,
    folderId: COMPANY_DOC_FOLDER.jsas,
    fields: CATALOG_FORMS.jsa.fields,
    rowFields: CATALOG_FORMS.jsa.rowFields,
    hint: CATALOG_FORMS.jsa.hint,
    print: true,
  },
  forms: {
    id: "forms",
    title: "Forms",
    folderId: COMPANY_DOC_FOLDER.forms,
    fields: [
      { id: "formTitle", label: "Form" },
      { id: "job", label: "Job" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "item", label: "Item" },
      { id: "value", label: "Value" },
    ],
  },
  "hse-updates": {
    id: "hse-updates",
    title: "HSE Updates",
    folderId: COMPANY_DOC_FOLDER["hse-updates"],
    fields: [
      { id: "bulletin", label: "Bulletin / update" },
      { id: "date", label: "Date", kind: "date" },
      { id: "job", label: "Job" },
      { id: "issuedBy", label: "Issued by" },
      { id: "summary", label: "Summary" },
      { id: "action", label: "Action" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "item", label: "Item" },
      { id: "owner", label: "Owner" },
      { id: "status", label: "Status" },
    ],
  },
};

export function hseTemplateCatalogIds(): HseFolderId[] {
  return HSE_MODULE_CATALOG.map((row) => row.id);
}

export function hseTemplateCompanyDocIds(): HseCompanyDocId[] {
  return HSE_COMPANY_DOC_CATALOG.map((row) => row.id);
}

export function isMadisonJsaForm(def?: HseTemplateFormDef | null) {
  return Boolean(def?.print || def?.id === "jsa" || def?.id === "jsas" || def?.title === MADISON_JSA_TITLE);
}

export function hseTemplateFormForCatalog(folderId?: string | null): HseTemplateFormDef | null {
  if (!isHseFolderId(folderId)) return null;
  return CATALOG_FORMS[folderId];
}

export function hseTemplateFormForCompanyDoc(
  docId?: string | null,
  fileName?: string | null,
): HseTemplateFormDef | null {
  if (!isHseCompanyDocId(docId)) return null;
  if (docId === "forms" || docId === "jsas") {
    const folder = resolveHseFolder(fileName || "");
    if (folder && folder !== "packages") return hseTemplateFormForCatalog(folder);
  }
  return COMPANY_DOC_FORMS[docId];
}

/** Feed-out: a filled copy listed on Packages still opens its home sheet, not the Packages cover. */
export function hseTemplateFormDefFromFilledName(fileName?: string | null): HseTemplateFormDef | null {
  const raw = hseCompanyDocFileName(fileName);
  if (!isHseFilledCopyName(raw)) return null;
  const title = raw.split(" — ")[0]?.trim() || "";
  if (!title) return null;
  const defs = [
    ...HSE_MODULE_CATALOG.map((row) => hseTemplateFormForCatalog(row.id)),
    ...HSE_COMPANY_DOC_CATALOG.map((row) => hseTemplateFormForCompanyDoc(row.id)),
  ].filter((def): def is HseTemplateFormDef => Boolean(def));
  const wanted = title.toLowerCase();
  return (
    defs
      .slice()
      .sort((left, right) => right.title.length - left.title.length)
      .find((def) => def.title.toLowerCase() === wanted || wanted.startsWith(`${def.title.toLowerCase()} `)) || null
  );
}

export function hseTemplateFormDef(input: {
  source: HseTemplateSourceKind;
  folderId?: string | null;
  fileName?: string | null;
}): HseTemplateFormDef | null {
  const fromFilled = hseTemplateFormDefFromFilledName(input.fileName);
  if (fromFilled) return fromFilled;
  if (input.source === "catalog") return hseTemplateFormForCatalog(input.folderId);
  return hseTemplateFormForCompanyDoc(input.folderId, input.fileName);
}

export function emptyHseTemplateFormRecord(_def: HseTemplateFormDef): HseTemplateFormRecord {
  return { fields: {}, rows: [] };
}

function hydrateFields(raw: unknown, defs: readonly QualityFieldDef[]): Record<string, string> {
  const incoming = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const def of defs) {
    const value = incoming[def.id];
    if (typeof value === "string") fields[def.id] = value;
    else if (value != null && typeof value !== "object") fields[def.id] = String(value);
  }
  return fields;
}

export function hydrateHseTemplateFormRecord(
  raw: unknown,
  def: HseTemplateFormDef,
): HseTemplateFormRecord {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    fields: hydrateFields(row.fields, def.fields),
    rows: hydrateRegisterRows(row.rows),
  };
}

export function hseTemplateFormHasWork(record: HseTemplateFormRecord) {
  return (
    Object.values(record.fields).some((value) => value.trim()) ||
    record.rows.some((row) => Object.values(row.cells).some((value) => value.trim()))
  );
}

export function patchHseTemplateField(
  record: HseTemplateFormRecord,
  field: string,
  value: string,
): HseTemplateFormRecord {
  return { ...record, fields: { ...record.fields, [field]: value } };
}

export function addHseTemplateRow(record: HseTemplateFormRecord, id?: string): HseTemplateFormRecord {
  return { ...record, rows: [...record.rows, emptyRegisterRow(id || `hf-${Date.now()}`)] };
}

export function patchHseTemplateRow(
  record: HseTemplateFormRecord,
  rowId: string,
  field: string,
  value: string,
): HseTemplateFormRecord {
  return {
    ...record,
    rows: record.rows.map((row) => (row.id === rowId ? { ...row, cells: { ...row.cells, [field]: value } } : row)),
  };
}

export function removeHseTemplateRow(record: HseTemplateFormRecord, rowId: string): HseTemplateFormRecord {
  return { ...record, rows: record.rows.filter((row) => row.id !== rowId) };
}

function filePart(value: string, max = 48) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function hseFilledCopyStamp(at = new Date()) {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hseFilledCopyName(input: {
  title: string;
  destLabel: string;
  userName: string;
  at?: Date;
  sourceName?: string;
}) {
  const title = filePart(input.title || "HSE form", 56);
  const dest = filePart(input.destLabel || "copy", 40);
  const user = filePart(input.userName || "desk", 32);
  const stamp = hseFilledCopyStamp(input.at);
  const named = `${title} — ${dest} — ${stamp} — ${user}${HSE_TEMPLATE_FILL_EXT}`;
  const source = hseCompanyDocFileName(input.sourceName);
  if (source && named.toLowerCase() === source.toLowerCase()) {
    return `${title} — ${dest} — ${stamp} — ${user} filled${HSE_TEMPLATE_FILL_EXT}`;
  }
  return named;
}

export function isHseFilledCopyName(name?: string | null) {
  return /\s—\s\d{4}-\d{2}-\d{2}\s—\s.+\.txt$/i.test(hseCompanyDocFileName(name));
}

export function hseFilledCopyCollidesWithTemplate(filledName: string, templateName?: string | null) {
  const filled = hseCompanyDocFileName(filledName).toLowerCase();
  const template = hseCompanyDocFileName(templateName).toLowerCase();
  if (!filled || !template) return false;
  return filled === template;
}

export function hseTemplateFillAcl(
  companyAcl: HseCompanyDocAcl,
  shelfAcl: HsePackageShelfAcl,
): HseTemplateFillAcl {
  const canSaveJob = Boolean(companyAcl.canAddRemove || shelfAcl.canAttach);
  const canSavePrepackage = Boolean(shelfAcl.canBuild);
  return {
    canOpen: true,
    canSaveJob,
    canSavePrepackage,
    canEditJsaTemplate: Boolean(companyAcl.canEditJsaTemplate),
    readOnly: !canSaveJob && !canSavePrepackage,
  };
}

export function hseTemplateCanSave(acl: HseTemplateFillAcl, dest: HseTemplateFillDest) {
  return dest === "job" ? acl.canSaveJob : acl.canSavePrepackage;
}

export function serializeHseTemplateForm(payload: HseTemplateFormPayload) {
  return `${HSE_TEMPLATE_FORM_MARK}\n${JSON.stringify(
    {
      mark: HSE_TEMPLATE_FORM_MARK,
      id: payload.id,
      title: payload.title,
      folderId: payload.folderId,
      source: payload.source,
      sourceFolder: payload.sourceFolder || "",
      sourceName: payload.sourceName || "",
      dest: payload.dest,
      destLabel: payload.destLabel,
      savedAt: payload.savedAt,
      user: payload.user,
      fields: payload.fields,
      rows: payload.rows,
    },
    null,
    2,
  )}\n`;
}

export function isHseFilledCopyText(text?: string | null) {
  return (text || "").startsWith(HSE_TEMPLATE_FORM_MARK);
}

export function parseHseTemplateForm(text: string): HseTemplateFormPayload | null {
  const raw = text.replace(/^\uFEFF/, "");
  if (!raw.startsWith(HSE_TEMPLATE_FORM_MARK)) return null;
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as Partial<HseTemplateFormPayload>;
    const folderId = isHseFolderId(parsed.folderId) ? parsed.folderId : "packages";
    const dest: HseTemplateFillDest = parsed.dest === "prepackage" ? "prepackage" : "job";
    const source: HseTemplateSourceKind = parsed.source === "company-docs" ? "company-docs" : "catalog";
    const def =
      hseTemplateFormDef({ source, folderId: parsed.id || folderId, fileName: parsed.sourceName }) ||
      hseTemplateFormForCatalog(folderId) ||
      COMPANY_DOC_FORMS.forms;
    const record = hydrateHseTemplateFormRecord({ fields: parsed.fields, rows: parsed.rows }, def);
    return {
      mark: HSE_TEMPLATE_FORM_MARK,
      id: typeof parsed.id === "string" && parsed.id ? parsed.id : def.id,
      title: typeof parsed.title === "string" && parsed.title ? parsed.title : def.title,
      folderId,
      source,
      sourceFolder: typeof parsed.sourceFolder === "string" ? parsed.sourceFolder : "",
      sourceName: typeof parsed.sourceName === "string" ? parsed.sourceName : "",
      dest,
      destLabel: typeof parsed.destLabel === "string" ? parsed.destLabel : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      user: typeof parsed.user === "string" ? parsed.user : "",
      fields: record.fields,
      rows: record.rows,
    };
  } catch {
    return null;
  }
}

export function hseTemplateFormToBytes(text: string) {
  return new TextEncoder().encode(text);
}

export function hseTemplateFormFromBytes(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export function hseTemplateFormToLead(
  payload: HseTemplateFormPayload,
  fileName: string,
): { name: string; type: string; data: string } {
  const bytes = hseTemplateFormToBytes(serializeHseTemplateForm(payload));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const data =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return { name: fileName, type: HSE_TEMPLATE_FILL_TYPE, data };
}

export function hseTemplateFormFromLead(file: { name?: string; type?: string; data?: string }) {
  const data = typeof file.data === "string" ? file.data : "";
  if (!data) return null;
  const binary = typeof atob === "function" ? atob(data) : Buffer.from(data, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return parseHseTemplateForm(hseTemplateFormFromBytes(bytes));
}

export function hseTemplateJobFolder(def: HseTemplateFormDef): HseFolderId {
  return def.folderId;
}

export function hseTemplateFormTitle(def: HseTemplateFormDef, fileName?: string | null) {
  const named = hseCompanyDocFileName(fileName);
  if (named && !isHseFilledCopyName(named)) return named.replace(/\.[^.]+$/, "") || def.title;
  return def.title;
}

export function hseAlwaysDisplayedTemplateCount() {
  return HSE_MODULE_CATALOG.length + HSE_COMPANY_DOC_CATALOG.length;
}

export function hseAlwaysDisplayedTemplates() {
  return [
    ...HSE_COMPANY_DOC_CATALOG.map((row) => ({
      source: "company-docs" as const,
      id: row.id,
      title: hseCompanyDocLabel(row.id),
    })),
    ...HSE_MODULE_CATALOG.map((row) => ({
      source: "catalog" as const,
      id: row.id,
      title: row.id === "jsa" ? MADISON_JSA_TITLE : hseFolderLabel(row.id),
    })),
  ];
}
