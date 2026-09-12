import {
  QUALITY_COMPANY_DOC_CATALOG,
  isQualityCompanyDocId,
  qualityCompanyDocFileName,
  qualityCompanyDocLabel,
  type QualityCompanyDocId,
} from "./quality-company-docs.ts";
import type { QualityCompanyDocAcl } from "./quality-company-doc-acl.ts";
import {
  QUALITY_FORM_FIELDS,
  QUALITY_FORM_ROW_FIELDS,
  QUALITY_FORM_ROW_HINT,
  QUALITY_PACKAGE_FORMS,
  emptySignoffRows,
  type QualityFieldDef,
  type QualityFormId,
} from "./quality-day1.ts";
import {
  QUALITY_MODULE_CATALOG,
  isQualityFolderId,
  qualityFolderLabel,
  resolveQualityFolder,
  type QualityFolderId,
} from "./quality-folders.ts";
import { QUALITY_SECTIONS } from "./quality-module.ts";
import type { QualityPackageShelfAcl } from "./quality-package-shelf.ts";
import { emptyRegisterRow, hydrateRegisterRows, type ModuleRegisterRow } from "./register-rows.ts";

/** Magic first line. Filled copies round-trip; blank rail templates never use this mark. */
export const QUALITY_TEMPLATE_FORM_MARK = "HS-QUALITY-FORM v1";
export const QUALITY_TEMPLATE_FILL_TYPE = "text/plain";
export const QUALITY_TEMPLATE_FILL_EXT = ".txt";
export const QUALITY_TEMPLATE_FILL_SCOPE = "template-fill";

export const QUALITY_TEMPLATE_FILL_VIEW_ERROR = "View only — this form cannot be saved from this seat.";
export const QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR =
  "The always-present template stays blank. Save the filled copy under a different name.";
export const QUALITY_TEMPLATE_FILL_DEST_ERROR =
  "Pick a job or a Ready prepackage. The company rail is not a save destination.";
export const QUALITY_TEMPLATE_FILL_JOB_ERROR = "Pick a job for this filled copy.";
export const QUALITY_TEMPLATE_FILL_PREPACKAGE_ERROR = "Pick or name a Ready prepackage for this filled copy.";

export type QualityTemplateSourceKind = "company-docs" | "catalog";
export type QualityTemplateFillDest = "job" | "prepackage";

export type QualityTemplateFormDef = {
  id: string;
  title: string;
  folderId: QualityFolderId;
  fields: readonly QualityFieldDef[];
  rowFields: readonly QualityFieldDef[];
  hint?: string;
};

export type QualityTemplateFormRecord = {
  fields: Record<string, string>;
  rows: ModuleRegisterRow[];
};

export type QualityTemplateFormPayload = {
  mark: typeof QUALITY_TEMPLATE_FORM_MARK;
  id: string;
  title: string;
  folderId: QualityFolderId;
  source: QualityTemplateSourceKind;
  sourceFolder?: string;
  sourceName?: string;
  dest: QualityTemplateFillDest;
  destLabel: string;
  savedAt: string;
  user: string;
  fields: Record<string, string>;
  rows: ModuleRegisterRow[];
};

export type QualityTemplateFillAcl = {
  canOpen: boolean;
  canSaveJob: boolean;
  canSavePrepackage: boolean;
  readOnly: boolean;
};

const PACKAGE_FORM_FOLDER: Record<QualityFormId, QualityFolderId> = {
  "2.7.1": "packages",
  "2.7.11": "packages",
  "2.7.17": "packages",
  "2.7.19": "flange-log",
  "2.7.22": "welders",
  "2.7.34": "job-completion",
  "2.7.5": "packages",
  "nde-req": "nde-request",
};

const COMPANY_DOC_FOLDER: Record<QualityCompanyDocId, QualityFolderId> = {
  "quality-control-manual": "packages",
  "code-documents": "packages",
  forms: "packages",
  "quality-updates": "packages",
};

const SECTION_FIELDS: Record<string, readonly QualityFieldDef[]> = Object.fromEntries(
  QUALITY_SECTIONS.map((section) => [section.id, section.fields]),
);

function sectionRows(sectionId: string, title: string, folderId: QualityFolderId, hint?: string): QualityTemplateFormDef {
  return {
    id: folderId,
    title,
    folderId,
    fields: [
      { id: "job", label: "Job" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
    ],
    rowFields: SECTION_FIELDS[sectionId] ?? [],
    hint,
  };
}

const CATALOG_FORMS: Record<QualityFolderId, QualityTemplateFormDef> = {
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
    hint: "Day-1 / job package cover. The blank catalog radio stays on the desk.",
  },
  "package-tracker": {
    id: "package-tracker",
    title: "Package Tracker",
    folderId: "package-tracker",
    fields: [
      { id: "job", label: "Job" },
      { id: "week", label: "Week / period" },
      { id: "preparedBy", label: "Prepared by" },
    ],
    rowFields: [
      { id: "package", label: "Package" },
      { id: "status", label: "Status" },
      { id: "issued", label: "Issued", kind: "date" },
      { id: "received", label: "Received", kind: "date" },
      { id: "comments", label: "Comments" },
    ],
  },
  "welds-nde": sectionRows("welds-nde", "Welds / NDE", "welds-nde"),
  welders: sectionRows("welders", "Welders", "welders"),
  "nde-request": {
    id: "nde-request",
    title: "NDE Request",
    folderId: "nde-request",
    fields: [
      { id: "job", label: "Job" },
      { id: "requestedBy", label: "Requested by" },
      { id: "date", label: "Date", kind: "date" },
    ],
    rowFields: QUALITY_FORM_ROW_FIELDS["nde-req"],
    hint: QUALITY_FORM_ROW_HINT["nde-req"],
  },
  wps: {
    id: "wps",
    title: "WPS",
    folderId: "wps",
    fields: [
      { id: "wpsNo", label: "WPS no." },
      { id: "process", label: "Process" },
      { id: "material", label: "Material" },
      { id: "thickness", label: "Thickness" },
      { id: "revision", label: "Revision" },
      { id: "approvedBy", label: "Approved by" },
      { id: "date", label: "Date", kind: "date" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "joint", label: "Joint / range" },
      { id: "status", label: "Status" },
    ],
  },
  gauges: sectionRows("calibration", "Gauges", "gauges", "Calibration / gauges. Add a row per gauge."),
  "weld-log": {
    id: "weld-log",
    title: "Weld Log",
    folderId: "weld-log",
    fields: [
      { id: "job", label: "Job" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
    ],
    rowFields: [
      { id: "weld", label: "Weld / joint" },
      { id: "welder", label: "Welder" },
      { id: "process", label: "Process" },
      { id: "wps", label: "WPS" },
      { id: "date", label: "Date", kind: "date" },
      { id: "result", label: "Result" },
    ],
  },
  "flange-log": {
    id: "flange-log",
    title: "Flange Log",
    folderId: "flange-log",
    fields: [
      { id: "job", label: "Job" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
    ],
    rowFields: QUALITY_FORM_ROW_FIELDS["2.7.19"],
    hint: QUALITY_FORM_ROW_HINT["2.7.19"],
  },
  travelers: sectionRows("travelers", "Travelers", "travelers"),
  "job-completion": {
    id: "job-completion",
    title: "Job Completion",
    folderId: "job-completion",
    fields: QUALITY_FORM_FIELDS["2.7.34"],
    rowFields: QUALITY_FORM_ROW_FIELDS["2.7.34"],
    hint: QUALITY_FORM_ROW_HINT["2.7.34"],
  },
  "rolling-chart": {
    id: "rolling-chart",
    title: "Rolling Chart",
    folderId: "rolling-chart",
    fields: [
      { id: "system", label: "System" },
      { id: "area", label: "Area" },
      { id: "preparedBy", label: "Prepared by" },
      { id: "date", label: "Date", kind: "date" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "item", label: "Item / hold" },
      { id: "location", label: "Location" },
      { id: "status", label: "Status" },
      { id: "date", label: "Date", kind: "date" },
    ],
  },
};

const COMPANY_DOC_FORMS: Record<QualityCompanyDocId, QualityTemplateFormDef> = {
  "quality-control-manual": {
    id: "quality-control-manual",
    title: "Quality Control Manual",
    folderId: COMPANY_DOC_FOLDER["quality-control-manual"],
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
      { id: "section", label: "Section" },
      { id: "finding", label: "Finding / note" },
    ],
    hint: "Fill a review copy. The blank manual stays on the left rail.",
  },
  "code-documents": {
    id: "code-documents",
    title: "Code Documents",
    folderId: COMPANY_DOC_FOLDER["code-documents"],
    fields: [
      { id: "code", label: "Code / standard" },
      { id: "edition", label: "Edition" },
      { id: "job", label: "Job" },
      { id: "applicable", label: "Applicable", kind: "yesno" },
      { id: "reviewedBy", label: "Reviewed by" },
      { id: "date", label: "Date", kind: "date" },
      { id: "notes", label: "Notes" },
    ],
    rowFields: [
      { id: "clause", label: "Clause" },
      { id: "note", label: "Note" },
    ],
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
  "quality-updates": {
    id: "quality-updates",
    title: "Quality Updates",
    folderId: COMPANY_DOC_FOLDER["quality-updates"],
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

export function qualityTemplateCatalogIds(): QualityFolderId[] {
  return QUALITY_MODULE_CATALOG.map((row) => row.id);
}

export function qualityTemplateCompanyDocIds(): QualityCompanyDocId[] {
  return QUALITY_COMPANY_DOC_CATALOG.map((row) => row.id);
}

export function matchQualityPackageForm(fileName?: string | null): QualityFormId | "" {
  const raw = qualityCompanyDocFileName(fileName).toLowerCase();
  if (!raw) return "";
  const exact = [...QUALITY_PACKAGE_FORMS]
    .sort((left, right) => right.id.length - left.id.length)
    .find((form) => raw.includes(form.id.toLowerCase()));
  if (exact) return exact.id;
  const labeled = QUALITY_PACKAGE_FORMS.find((form) => raw.includes(form.label.toLowerCase()));
  if (labeled) return labeled.id;
  const folder = resolveQualityFolder(raw);
  if (folder === "flange-log") return "2.7.19";
  if (folder === "job-completion") return "2.7.34";
  if (folder === "nde-request") return "nde-req";
  if (folder === "weld-log") return "2.7.22";
  return "";
}

export function qualityTemplateFormFromPackage(id: QualityFormId): QualityTemplateFormDef {
  const item = QUALITY_PACKAGE_FORMS.find((form) => form.id === id);
  return {
    id,
    title: item?.label ?? id,
    folderId: PACKAGE_FORM_FOLDER[id],
    fields: QUALITY_FORM_FIELDS[id],
    rowFields: QUALITY_FORM_ROW_FIELDS[id],
    hint: QUALITY_FORM_ROW_HINT[id],
  };
}

export function qualityTemplateFormForCatalog(folderId?: string | null): QualityTemplateFormDef | null {
  if (!isQualityFolderId(folderId)) return null;
  return CATALOG_FORMS[folderId];
}

export function qualityTemplateFormForCompanyDoc(
  docId?: string | null,
  fileName?: string | null,
): QualityTemplateFormDef | null {
  if (!isQualityCompanyDocId(docId)) return null;
  if (docId === "forms") {
    const pack = matchQualityPackageForm(fileName);
    if (pack) return qualityTemplateFormFromPackage(pack);
    const folder = resolveQualityFolder(fileName || "");
    if (folder && folder !== "packages") return qualityTemplateFormForCatalog(folder);
  }
  const named = matchQualityPackageForm(fileName);
  if (named) return qualityTemplateFormFromPackage(named);
  return COMPANY_DOC_FORMS[docId];
}

export function qualityTemplateFormDef(input: {
  source: QualityTemplateSourceKind;
  folderId?: string | null;
  fileName?: string | null;
}): QualityTemplateFormDef | null {
  if (input.source === "catalog") return qualityTemplateFormForCatalog(input.folderId);
  return qualityTemplateFormForCompanyDoc(input.folderId, input.fileName);
}

export function emptyQualityTemplateFormRecord(def: QualityTemplateFormDef): QualityTemplateFormRecord {
  if (def.id === "job-completion" || def.id === "2.7.34") {
    return { fields: {}, rows: emptySignoffRows() };
  }
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

export function hydrateQualityTemplateFormRecord(
  raw: unknown,
  def: QualityTemplateFormDef,
): QualityTemplateFormRecord {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields = hydrateFields(row.fields, def.fields);
  const rows = hydrateRegisterRows(row.rows);
  if ((def.id === "job-completion" || def.id === "2.7.34") && rows.length === 0) {
    return { fields, rows: emptySignoffRows() };
  }
  return { fields, rows };
}

export function qualityTemplateFormHasWork(record: QualityTemplateFormRecord) {
  return (
    Object.values(record.fields).some((value) => value.trim()) ||
    record.rows.some((row) => Object.values(row.cells).some((value) => value.trim()))
  );
}

export function patchQualityTemplateField(
  record: QualityTemplateFormRecord,
  field: string,
  value: string,
): QualityTemplateFormRecord {
  return { ...record, fields: { ...record.fields, [field]: value } };
}

export function addQualityTemplateRow(record: QualityTemplateFormRecord, id?: string): QualityTemplateFormRecord {
  return { ...record, rows: [...record.rows, emptyRegisterRow(id || `qf-${Date.now()}`)] };
}

export function patchQualityTemplateRow(
  record: QualityTemplateFormRecord,
  rowId: string,
  field: string,
  value: string,
): QualityTemplateFormRecord {
  return {
    ...record,
    rows: record.rows.map((row) => (row.id === rowId ? { ...row, cells: { ...row.cells, [field]: value } } : row)),
  };
}

export function removeQualityTemplateRow(record: QualityTemplateFormRecord, rowId: string): QualityTemplateFormRecord {
  return { ...record, rows: record.rows.filter((row) => row.id !== rowId) };
}

function filePart(value: string, max = 48) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function qualityFilledCopyStamp(at = new Date()) {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function qualityFilledCopyName(input: {
  title: string;
  destLabel: string;
  userName: string;
  at?: Date;
  sourceName?: string;
}) {
  const title = filePart(input.title || "Quality form", 56);
  const dest = filePart(input.destLabel || "copy", 40);
  const user = filePart(input.userName || "desk", 32);
  const stamp = qualityFilledCopyStamp(input.at);
  const named = `${title} — ${dest} — ${stamp} — ${user}${QUALITY_TEMPLATE_FILL_EXT}`;
  const source = qualityCompanyDocFileName(input.sourceName);
  if (source && named.toLowerCase() === source.toLowerCase()) {
    return `${title} — ${dest} — ${stamp} — ${user} filled${QUALITY_TEMPLATE_FILL_EXT}`;
  }
  return named;
}

export function isQualityFilledCopyName(name?: string | null) {
  return /\s—\s\d{4}-\d{2}-\d{2}\s—\s.+\.txt$/i.test(qualityCompanyDocFileName(name));
}

export function qualityFilledCopyCollidesWithTemplate(filledName: string, templateName?: string | null) {
  const filled = qualityCompanyDocFileName(filledName).toLowerCase();
  const template = qualityCompanyDocFileName(templateName).toLowerCase();
  if (!filled || !template) return false;
  return filled === template;
}

export function qualityTemplateFillAcl(
  companyAcl: QualityCompanyDocAcl,
  shelfAcl: QualityPackageShelfAcl,
): QualityTemplateFillAcl {
  const canSaveJob = Boolean(companyAcl.canAddRemove || shelfAcl.canAttach);
  const canSavePrepackage = Boolean(shelfAcl.canBuild);
  return {
    canOpen: true,
    canSaveJob,
    canSavePrepackage,
    readOnly: !canSaveJob && !canSavePrepackage,
  };
}

export function qualityTemplateCanSave(acl: QualityTemplateFillAcl, dest: QualityTemplateFillDest) {
  return dest === "job" ? acl.canSaveJob : acl.canSavePrepackage;
}

export function serializeQualityTemplateForm(payload: QualityTemplateFormPayload) {
  return `${QUALITY_TEMPLATE_FORM_MARK}\n${JSON.stringify(
    {
      mark: QUALITY_TEMPLATE_FORM_MARK,
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

export function isQualityFilledCopyText(text?: string | null) {
  return (text || "").startsWith(QUALITY_TEMPLATE_FORM_MARK);
}

export function parseQualityTemplateForm(text: string): QualityTemplateFormPayload | null {
  const raw = text.replace(/^\uFEFF/, "");
  if (!raw.startsWith(QUALITY_TEMPLATE_FORM_MARK)) return null;
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as Partial<QualityTemplateFormPayload>;
    const folderId = isQualityFolderId(parsed.folderId) ? parsed.folderId : "packages";
    const dest: QualityTemplateFillDest = parsed.dest === "prepackage" ? "prepackage" : "job";
    const source: QualityTemplateSourceKind = parsed.source === "company-docs" ? "company-docs" : "catalog";
    const def =
      qualityTemplateFormDef({ source, folderId: parsed.id || folderId, fileName: parsed.sourceName }) ||
      qualityTemplateFormForCatalog(folderId) ||
      COMPANY_DOC_FORMS.forms;
    const record = hydrateQualityTemplateFormRecord({ fields: parsed.fields, rows: parsed.rows }, def);
    return {
      mark: QUALITY_TEMPLATE_FORM_MARK,
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

export function qualityTemplateFormToBytes(text: string) {
  return new TextEncoder().encode(text);
}

export function qualityTemplateFormFromBytes(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export function qualityTemplateFormToLead(
  payload: QualityTemplateFormPayload,
  fileName: string,
): { name: string; type: string; data: string } {
  const bytes = qualityTemplateFormToBytes(serializeQualityTemplateForm(payload));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const data =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return { name: fileName, type: QUALITY_TEMPLATE_FILL_TYPE, data };
}

export function qualityTemplateFormFromLead(file: { name?: string; type?: string; data?: string }) {
  const data = typeof file.data === "string" ? file.data : "";
  if (!data) return null;
  const binary = typeof atob === "function" ? atob(data) : Buffer.from(data, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return parseQualityTemplateForm(qualityTemplateFormFromBytes(bytes));
}

export function qualityTemplateJobFolder(def: QualityTemplateFormDef): QualityFolderId {
  return def.folderId;
}

export function qualityTemplateFormTitle(def: QualityTemplateFormDef, fileName?: string | null) {
  const named = qualityCompanyDocFileName(fileName);
  if (named && !isQualityFilledCopyName(named)) return named.replace(/\.[^.]+$/, "") || def.title;
  return def.title;
}

export function qualityAlwaysDisplayedTemplateCount() {
  return QUALITY_MODULE_CATALOG.length + QUALITY_COMPANY_DOC_CATALOG.length;
}

export function qualityAlwaysDisplayedTemplates() {
  return [
    ...QUALITY_COMPANY_DOC_CATALOG.map((row) => ({
      source: "company-docs" as const,
      id: row.id,
      title: qualityCompanyDocLabel(row.id),
    })),
    ...QUALITY_MODULE_CATALOG.map((row) => ({
      source: "catalog" as const,
      id: row.id,
      title: qualityFolderLabel(row.id),
    })),
  ];
}
