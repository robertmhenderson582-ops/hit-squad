import { canSeeCompany, companyScopeFor, type CompanyScope } from "./companies.ts";
import { hasBuildDesk, isOwner } from "./desk-role.ts";
import type { PublicLeadBrief } from "./lead-briefs.ts";
import { PHASE_IDS, PHASE_NAMES, type PhaseRow } from "./phase-schedule.ts";
import { emptyRegisterRow, hydrateRegisterRows, type ModuleRegisterRow } from "./register-rows.ts";

export const QUALITY_DAY1_LABEL = "Quality Day-1";
export const QUALITY_LIVE_NOTE = "This job is live for Quality. Named forms and the rolling chart sit on this module.";

/** Chance’s 2.7.x Day-1 package. Names only — files stay in the owner vault. Do not invent extra numbers. */
export const QUALITY_PACKAGE_FORMS = [
  { id: "2.7.1", label: "2.7.1 Madison Pressure Test Record Rev 2" },
  { id: "2.7.11", label: "2.7.11 Madison Document Transmittal Form Rev. 2" },
  { id: "2.7.17", label: "2.7.17 ROD Issue Form Rev. 4" },
  { id: "2.7.19", label: "2.7.19 Madison Flange Log Rev.1" },
  { id: "2.7.22", label: "2.7.22 Weld Test Instruction Form Rev. 8" },
  { id: "2.7.34", label: "2.7.34 Job Completion Sign-off Form Rev 2" },
  { id: "2.7.5", label: "2.7.5 Madison Punch List Rev. 1" },
  { id: "nde-req", label: "NDE req spreadsheet" },
] as const;

export type QualityFormId = (typeof QUALITY_PACKAGE_FORMS)[number]["id"];

export type QualityFieldKind = "text" | "date" | "yesno";

export type QualityFieldDef = {
  id: string;
  label: string;
  kind?: QualityFieldKind;
};

/** Header fields Chance types. Spreadsheet books stay in the vault. */
export const QUALITY_FORM_FIELDS: Record<QualityFormId, readonly QualityFieldDef[]> = {
  "2.7.1": [
    { id: "job", label: "Job" },
    { id: "line", label: "Line" },
    { id: "system", label: "System" },
    { id: "testMedium", label: "Test medium" },
    { id: "testPressure", label: "Test pressure" },
    { id: "duration", label: "Duration" },
    { id: "start", label: "Start" },
    { id: "finish", label: "Finish" },
    { id: "result", label: "Result" },
    { id: "signedBy", label: "Sign-off name" },
    { id: "signedDate", label: "Sign-off date", kind: "date" },
  ],
  "2.7.11": [
    { id: "to", label: "To" },
    { id: "from", label: "From" },
    { id: "date", label: "Date", kind: "date" },
    { id: "transmittalNo", label: "Transmittal no." },
    { id: "purpose", label: "Purpose" },
    { id: "receivedBy", label: "Received by" },
  ],
  "2.7.17": [
    { id: "rodNo", label: "ROD no." },
    { id: "issuedTo", label: "Issued to" },
    { id: "item", label: "Item / description" },
    { id: "qty", label: "Qty" },
    { id: "dateOut", label: "Date out", kind: "date" },
    { id: "dateIn", label: "Date in", kind: "date" },
    { id: "status", label: "Status" },
  ],
  "2.7.19": [],
  "2.7.22": [
    { id: "weld", label: "Weld / joint" },
    { id: "process", label: "Process" },
    { id: "wps", label: "WPS" },
    { id: "welderStamp", label: "Welder stamp" },
    { id: "testType", label: "Test type" },
    { id: "result", label: "Result" },
    { id: "date", label: "Date", kind: "date" },
  ],
  "2.7.34": [
    { id: "scope", label: "Scope" },
    { id: "punchRemaining", label: "Punch remaining", kind: "yesno" },
    { id: "exceptions", label: "Exceptions" },
  ],
  "2.7.5": [],
  "nde-req": [],
};

/** Addable rows. 2.7.19 is the live flange log — same rows as the Connections board. */
export const QUALITY_FORM_ROW_FIELDS: Record<QualityFormId, readonly QualityFieldDef[]> = {
  "2.7.1": [{ id: "gaugeId", label: "Gauge ID" }],
  "2.7.11": [
    { id: "name", label: "Document" },
    { id: "rev", label: "Rev" },
    { id: "copies", label: "Copies" },
  ],
  "2.7.17": [
    { id: "item", label: "Item / tag" },
    { id: "description", label: "Description" },
    { id: "qty", label: "Qty" },
    { id: "issuedTo", label: "Issued to" },
    { id: "dateOut", label: "Date out", kind: "date" },
    { id: "dateIn", label: "Date in", kind: "date" },
    { id: "status", label: "Status" },
  ],
  "2.7.19": [
    { id: "flangeId", label: "Flange / joint ID" },
    { id: "location", label: "Location" },
    { id: "sizeRating", label: "Size / rating" },
    { id: "gasket", label: "Gasket" },
    { id: "boltUp", label: "Bolt-up" },
    { id: "status", label: "Status" },
    { id: "date", label: "Date", kind: "date" },
  ],
  "2.7.22": [],
  "2.7.34": [
    { id: "role", label: "Role" },
    { id: "name", label: "Name" },
    { id: "date", label: "Date", kind: "date" },
  ],
  "2.7.5": [
    { id: "item", label: "Item" },
    { id: "location", label: "Location" },
    { id: "discipline", label: "Discipline" },
    { id: "issued", label: "Issued", kind: "date" },
    { id: "closed", label: "Closed", kind: "date" },
    { id: "status", label: "Status" },
  ],
  "nde-req": [
    { id: "weldIso", label: "Weld / ISO" },
    { id: "method", label: "Method (RT / UT / PT / MT)" },
    { id: "requested", label: "Requested", kind: "date" },
    { id: "completed", label: "Completed", kind: "date" },
    { id: "result", label: "Result" },
  ],
};

export const QUALITY_FORM_ROW_HINT: Partial<Record<QualityFormId, string>> = {
  "2.7.1": "Gauges used on this test. Add a row per gauge.",
  "2.7.11": "Documents on this transmittal.",
  "2.7.17": "ROD line items. Add a row per item issued.",
  "2.7.19": "Live flange log. Same rows as the Connections board — this is the source of truth. xlsx stays in the vault.",
  "2.7.34": "Typed sign-off rows. Quality / craft / client — names and dates, not e-sign.",
  "2.7.5": "Punch items. Leave the item blank if there is no number yet — do not invent punch numbers.",
  "nde-req": "NDE requests. Spreadsheet stays in the vault. Type the method.",
};

export type QualityFormRecord = {
  fields: Record<string, string>;
  rows: ModuleRegisterRow[];
};

export type QualityDay1 = {
  inspectionPlan: boolean;
  weldMap: boolean;
  travelerCount: string;
  forms: Partial<Record<QualityFormId, QualityFormRecord>>;
};

export function emptyQualityFormRecord(id?: QualityFormId): QualityFormRecord {
  return {
    fields: {},
    rows: id === "2.7.34" ? emptySignoffRows() : [],
  };
}

export function emptySignoffRows(): ModuleRegisterRow[] {
  return [
    { id: "sign-quality", cells: { role: "Quality", name: "", date: "" } },
    { id: "sign-craft", cells: { role: "Craft", name: "", date: "" } },
    { id: "sign-client", cells: { role: "Client", name: "", date: "" } },
  ];
}

export function emptyQualityDay1(): QualityDay1 {
  return { inspectionPlan: false, weldMap: false, travelerCount: "", forms: {} };
}

function hydrateFields(raw: unknown, defs: readonly QualityFieldDef[]): Record<string, string> {
  const incoming = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const def of defs) {
    const value = incoming[def.id];
    if (typeof value === "string" && value.trim()) fields[def.id] = value;
    else if (value != null && typeof value !== "object") fields[def.id] = String(value);
  }
  return fields;
}

function formHasWork(record: QualityFormRecord) {
  return Object.values(record.fields).some((value) => value.trim()) || record.rows.some((row) => Object.values(row.cells).some((value) => value.trim()));
}

export function hydrateQualityFormRecord(raw: unknown, id: QualityFormId): QualityFormRecord {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields = hydrateFields(row.fields, QUALITY_FORM_FIELDS[id]);
  // Prior Day-1 Fill/Count shells — keep typed notes, do not treat them as the form.
  if (typeof row.fill === "string" && row.fill.trim() && !fields.notes) fields.notes = row.fill.trim();
  const rows = hydrateRegisterRows(row.rows);
  if (id === "2.7.34" && rows.length === 0) {
    return { fields, rows: emptySignoffRows() };
  }
  return { fields, rows };
}

export function hydrateQualityDay1(raw: Partial<QualityDay1> | Record<string, unknown> | null | undefined): QualityDay1 {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const incoming = row.forms && typeof row.forms === "object" ? (row.forms as Record<string, unknown>) : {};
  const forms: Partial<Record<QualityFormId, QualityFormRecord>> = {};
  for (const item of QUALITY_PACKAGE_FORMS) {
    if (incoming[item.id] == null) continue;
    const record = hydrateQualityFormRecord(incoming[item.id], item.id);
    if (formHasWork(record)) forms[item.id] = record;
  }
  return {
    inspectionPlan: Boolean(row.inspectionPlan),
    weldMap: Boolean(row.weldMap),
    travelerCount: typeof row.travelerCount === "string" ? row.travelerCount : row.travelerCount != null ? String(row.travelerCount) : "",
    forms,
  };
}

export function qualityFormRecord(pack: QualityDay1, id: QualityFormId): QualityFormRecord {
  return pack.forms[id] ?? emptyQualityFormRecord(id);
}

export function patchQualityFormFields(pack: QualityDay1, id: QualityFormId, field: string, value: string): QualityDay1 {
  const current = qualityFormRecord(pack, id);
  return {
    ...pack,
    forms: {
      ...pack.forms,
      [id]: { ...current, fields: { ...current.fields, [field]: value } },
    },
  };
}

export function addQualityFormRow(pack: QualityDay1, id: QualityFormId): QualityDay1 {
  const current = qualityFormRecord(pack, id);
  return {
    ...pack,
    forms: {
      ...pack.forms,
      [id]: { ...current, rows: [...current.rows, emptyRegisterRow(`qf-${id}-${Date.now()}`)] },
    },
  };
}

export function patchQualityFormRow(
  pack: QualityDay1,
  id: QualityFormId,
  rowId: string,
  field: string,
  value: string,
): QualityDay1 {
  const current = qualityFormRecord(pack, id);
  return {
    ...pack,
    forms: {
      ...pack.forms,
      [id]: {
        ...current,
        rows: current.rows.map((row) => (row.id === rowId ? { ...row, cells: { ...row.cells, [field]: value } } : row)),
      },
    },
  };
}

export function removeQualityFormRow(pack: QualityDay1, id: QualityFormId, rowId: string): QualityDay1 {
  const current = qualityFormRecord(pack, id);
  return {
    ...pack,
    forms: {
      ...pack.forms,
      [id]: { ...current, rows: current.rows.filter((row) => row.id !== rowId) },
    },
  };
}

export function setQualityFormRows(pack: QualityDay1, id: QualityFormId, rows: ModuleRegisterRow[]): QualityDay1 {
  const current = qualityFormRecord(pack, id);
  return { ...pack, forms: { ...pack.forms, [id]: { ...current, rows } } };
}

/** Traveler count follows board rows when rows change. Typing a count does not invent travelers. */
export function travelerCountFromRows(rows: ModuleRegisterRow[]) {
  return String(rows.length);
}

/** Phase / work names only. No invented hold points. */
export function qualityWorkNames(phases: PhaseRow[] = []) {
  return PHASE_IDS.filter((id) => phases.some((phase) => phase.id === id && phase.on)).map((id) => PHASE_NAMES[id]);
}

/** Awarded / live hinge. Kept for a later lead ask. V1.51 does not fire this interaction. */
export function qualityLive(status = "") {
  return status === "Awarded" || status === "Submitted" || status === "Estimate";
}

/** Estimate → Quality notify hinge. Kept inactive. Do not delete. */
export function qualityNotify(status = "") {
  return status === "Awarded";
}

export function canSeeMadisonManuals(
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  if (isOwner(user) || hasBuildDesk(user)) return true;
  const next = scope ?? companyScopeFor(user);
  return canSeeCompany(next, "madison");
}

const VAULT_LEAK =
  /quality-briefs\.json|hse-briefs\.json|1y6Q3TOnpXzV|1zYl2dEvW21|1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|drive\.google\.com|vault id|owner vault|\/tmp\/hit-squad/i;

export function qualitySurfaceLeaks(payload: unknown) {
  return VAULT_LEAK.test(JSON.stringify(payload ?? ""));
}

/** Names only. Never vault ids, bytes, or other testers' drops. */
export function publicQualityDrops(briefs: PublicLeadBrief[], who?: string): Array<{ name: string; files: string[] }> {
  const key = (who || "").trim().toLowerCase();
  return briefs
    .filter((brief) => !key || brief.who === key)
    .map((brief) => ({
      name: brief.describe || "Quality brief",
      files: brief.files.map((file) => file.name).filter(Boolean),
    }));
}

export function madisonManualLabel(kind: "quality" | "hse") {
  return kind === "hse" ? "Madison Safety Manual / HES SOPs" : "Madison QC manuals";
}

export function qualityPackageForSeat(
  pack: QualityDay1,
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  const surface = {
    inspectionPlan: pack.inspectionPlan,
    weldMap: pack.weldMap,
    travelerCount: pack.travelerCount,
    forms: QUALITY_PACKAGE_FORMS.map((item) => ({
      id: item.id,
      label: item.label,
      fields: qualityFormRecord(pack, item.id).fields,
      rows: qualityFormRecord(pack, item.id).rows,
    })),
    manuals: canSeeMadisonManuals(user, scope) ? [madisonManualLabel("quality")] : [],
  };
  if (qualitySurfaceLeaks(surface)) {
    return {
      inspectionPlan: pack.inspectionPlan,
      weldMap: pack.weldMap,
      travelerCount: pack.travelerCount,
      forms: QUALITY_PACKAGE_FORMS.map((item) => ({
        id: item.id,
        label: item.label,
        fields: qualityFormRecord(pack, item.id).fields,
        rows: qualityFormRecord(pack, item.id).rows,
      })),
      manuals: [] as string[],
    };
  }
  return surface;
}

export const QUALITY_VAULT_NAMES = {
  file: "quality-briefs.json",
  kind: "quality-briefs",
};
