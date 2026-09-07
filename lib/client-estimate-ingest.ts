/**
 * Staged ingest from client estimate faces into Hit Squad.
 *
 * Rodeo has MULTIPLE templates — do not collapse:
 *   A. Madison Turnaround Contractor Estimate Template
 *      hours × one composite rate; Direct vs Indirect; INSTRUCTIONS / SUMMARY / tabs 1–9
 *   B. P66 RODEO ESTIMATE WORKBOOK (~4.5MB)
 *      Blank Needs Rates + filled U110 / U250 books
 *   C. Client Estimate Form family (U240 examples under Rodeo/U240)
 *
 * Monroe 541V official lock is its own POST REVIEW workbook — not A or B.
 *
 * John loop: Robert Excel → Hit Squad live pack → estimate fills P66-shaped export → Robert pastes into official file.
 *
 * This path classifies and returns seed metadata only. It does not create
 * crew calendars or remap live pack totals. Native Hit Squad xlsx still
 * uses estimate-xlsx-import.
 */

import ExcelJS from "exceljs";
import { ESTIMATE_XLSX_SHEETS } from "./estimate-xlsx.ts";
import { BOILER17_PACK_ID } from "./boiler-17.ts";
import {
  MONROE_541V_PACK_ID,
  RODEO_U110_PACK_ID,
  RODEO_U250_PACK_ID,
  wakeShellByPackId,
  type WakeJobShell,
  type WakeTemplateFamily,
} from "./rodeo-monroe-wake.ts";
import { P66_V1_EXPORT_LINE } from "./p66-v1.ts";
import {
  isOfficialRevisionId,
  isRodeoWorkbookFamilyId,
  OFFICIAL_BOILER17_B1_REVISION_NAME,
  OFFICIAL_MONROE_541V_REVISION_NAME,
  OFFICIAL_U110_REVISION_NAME,
  OFFICIAL_U250_REVISION_NAME,
  RODEO_WORKBOOK_BLANK_NAME,
  RODEO_WORKBOOK_U110_NAME,
  RODEO_WORKBOOK_U250_NAME,
} from "./work-folder.ts";

export const CLIENT_TEMPLATE_STAGED =
  "Client estimate face staged. Not applied to the live pack. Official Gmail revisions lock filled totals.";

export type EstimateWorkbookKind =
  | "hitsquad-live-pack"
  | WakeTemplateFamily
  | "unknown-client";

export type ClientWorkbookClass = {
  kind: EstimateWorkbookKind;
  label: string;
  sheets: string[];
  fileName: string;
  staged: boolean;
  /** Reserved pack slot when the face maps to a wake job. */
  packId?: string;
  families: WakeTemplateFamily[];
  note: string;
};

const CONTRACTOR_TEMPLATE_RE = /turnaround\s+contractor\s+estimate\s+template/i;
const RODEO_WORKBOOK_RE = /p66\s+rodeo\s+estimate\s+workbook/i;
const CLIENT_FORM_RE = /client\s+estimate\s+form|\bu240\b/i;
const MONROE_WORKBOOK_RE = /monroe\s+energy.*estimate\s+workbook|u541\s+vac|541v.*post\s+review/i;
const WOOD_RIVER_B1_RE = /boiler\s*17/i;
const FERNDALE_WORKBOOK_RE = /ferndale\s+estimate\s+workbook/i;
const FERNDALE_FRN_RFX_RE = /\bfrn\b/i;
const FERNDALE_RFX_RE = /rfx\s*0*26[67]|rfx\s*0*270/i;

function sheetKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function looksLikeHitSquadPack(sheets: string[]) {
  const names = new Set(sheets.map((name) => name.trim()));
  if (names.has(ESTIMATE_XLSX_SHEETS.summary) && names.has(ESTIMATE_XLSX_SHEETS.jobSetup)) return true;
  return (
    names.has(ESTIMATE_XLSX_SHEETS.direct) &&
    names.has(ESTIMATE_XLSX_SHEETS.staff) &&
    names.has(ESTIMATE_XLSX_SHEETS.summary)
  );
}

/** Family A: hours × composite rate, Direct vs Indirect, INSTRUCTIONS / SUMMARY / tabs 1–9. */
export function looksLikeMadisonContractorTemplate(sheets: string[], fileName = "") {
  if (CONTRACTOR_TEMPLATE_RE.test(fileName)) return true;
  const keys = sheets.map(sheetKey);
  const instructions = keys.some((name) => name === "instructions" || name.includes("instruction"));
  const summary = keys.some((name) => name === "summary" || name === "summary page");
  const numbered = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].filter((tab) =>
    keys.some((name) => name === tab || name.startsWith(`${tab} `)),
  );
  const directIndirect =
    keys.some((name) => /\bdirect\b/.test(name)) && keys.some((name) => /\bindirect\b/.test(name));
  return Boolean(instructions && summary && (numbered.length >= 5 || directIndirect));
}

/** Family B: P66 RODEO ESTIMATE WORKBOOK. Never treat as family A. */
export function looksLikeP66RodeoWorkbook(sheets: string[], fileName = "") {
  if (RODEO_WORKBOOK_RE.test(fileName)) return true;
  if (/\bblank needs rates\b/i.test(fileName)) return true;
  const keys = sheets.map(sheetKey);
  return keys.some((name) => name.includes("rodeo estimate") || name.includes("needs rates"));
}

/** Family C: Client Estimate Form (U240 examples). */
export function looksLikeClientEstimateForm(sheets: string[], fileName = "") {
  if (CLIENT_FORM_RE.test(fileName)) return true;
  const keys = sheets.map(sheetKey);
  return keys.some((name) => name.includes("client estimate form") || name === "u240");
}

export function looksLikeMonroeWorkbook(sheets: string[], fileName = "") {
  if (MONROE_WORKBOOK_RE.test(fileName)) return true;
  const keys = sheets.map(sheetKey);
  return keys.some((name) => name.includes("541v") || name.includes("u541") || name.includes("post review"));
}

/** Official Wood River B-1 (Boiler 17 RH). Staged — do not invent crew from #REF labor $. */
export function looksLikeWoodRiverB1(sheets: string[], fileName = "") {
  if (WOOD_RIVER_B1_RE.test(fileName) && /b-?1/i.test(fileName)) return true;
  const keys = sheets.map(sheetKey);
  return WOOD_RIVER_B1_RE.test(fileName) && keys.some((name) => name.includes("summary page") || name === "summary page");
}

/** Ferndale GEP / TASO EST workbooks. Not a Rodeo family. */
export function looksLikeFerndaleGep(sheets: string[], fileName = "") {
  void sheets;
  if (FERNDALE_WORKBOOK_RE.test(fileName)) return true;
  return FERNDALE_FRN_RFX_RE.test(fileName) && FERNDALE_RFX_RE.test(fileName);
}

export function classifyFromSheetsAndName(sheets: string[], fileName = ""): ClientWorkbookClass {
  const name = fileName.trim();
  if (looksLikeHitSquadPack(sheets)) {
    return {
      kind: "hitsquad-live-pack",
      label: "Hit Squad live pack workbook",
      sheets,
      fileName: name,
      staged: false,
      families: [],
      note: "Native Hit Squad xlsx. Import writes the live pack (excel-ripple).",
    };
  }
  if (looksLikeFerndaleGep(sheets, name)) {
    return {
      kind: "ferndale-gep",
      label: "Ferndale GEP / TASO estimate workbook",
      sheets,
      fileName: name,
      staged: true,
      families: ["ferndale-gep"],
      note: "Ferndale GEP / TASO face. Staged only. Not a Rodeo clone. Official RFX totals stay on Drive.",
    };
  }
  if (looksLikeP66RodeoWorkbook(sheets, name)) {
    const packId = /\bu-?250\b/i.test(name) ? RODEO_U250_PACK_ID : /\bu-?110|unit 110/i.test(name) ? RODEO_U110_PACK_ID : undefined;
    return {
      kind: "p66-rodeo-workbook",
      label: "P66 RODEO ESTIMATE WORKBOOK",
      sheets,
      fileName: name,
      staged: true,
      packId,
      families: ["p66-rodeo-workbook"],
      note: "Family B. Additional Rodeo workbook — not the Madison contractor template. Staged only.",
    };
  }
  if (looksLikeMadisonContractorTemplate(sheets, name)) {
    const packId = /\bu250\b/i.test(name) ? RODEO_U250_PACK_ID : /\bu110\b/i.test(name) ? RODEO_U110_PACK_ID : undefined;
    return {
      kind: "madison-contractor",
      label: "Madison Turnaround Contractor Estimate Template",
      sheets,
      fileName: name,
      staged: true,
      packId,
      families: ["madison-contractor"],
      note: "Family A. Hours × composite rate, Direct vs Indirect. Staged — official revision locks totals.",
    };
  }
  if (looksLikeClientEstimateForm(sheets, name)) {
    return {
      kind: "client-estimate-form",
      label: "Client Estimate Form",
      sheets,
      fileName: name,
      staged: true,
      families: ["client-estimate-form"],
      note: "Family C. Client Estimate Form (U240 examples). Staged only. Do not collapse into A or B.",
    };
  }
  if (looksLikeWoodRiverB1(sheets, name)) {
    return {
      kind: "wood-river-b1",
      label: "Wood River B-1 (Boiler 17)",
      sheets,
      fileName: name,
      staged: true,
      packId: BOILER17_PACK_ID,
      families: ["wood-river-b1"],
      note: "Official RH B-1. Hours lock from Drive text. Labor $ formulas were #REF — staged only. Cost wires to Mike CPPR 108451.",
    };
  }
  if (looksLikeMonroeWorkbook(sheets, name)) {
    return {
      kind: "monroe-workbook",
      label: "Monroe Energy estimate workbook",
      sheets,
      fileName: name,
      staged: true,
      packId: MONROE_541V_PACK_ID,
      families: ["monroe-workbook"],
      note: "Monroe 541V workbook. Official POST REVIEW locks filled totals. Staged only.",
    };
  }
  return {
    kind: "unknown-client",
    label: "Unrecognized client workbook",
    sheets,
    fileName: name,
    staged: true,
    families: [],
    note: CLIENT_TEMPLATE_STAGED,
  };
}

export async function classifyEstimateWorkbook(bytes: Uint8Array, fileName = ""): Promise<ClientWorkbookClass> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheets = wb.worksheets.map((sheet) => sheet.name);
  return classifyFromSheetsAndName(sheets, fileName);
}

export type WakeIngestSeed = {
  packId: string;
  title: string;
  client: string;
  site: string;
  siteId: string;
  families: WakeTemplateFamily[];
  officialRevisionId: string;
  officialRevisionName: string;
  extraTemplateIds: string[];
  /** Always empty — do not invent calendars. */
  crewRanges: Record<string, never>;
  totalsLockedBy: "official-revision";
};

export function wakeIngestSeed(shell: WakeJobShell): WakeIngestSeed {
  return {
    packId: shell.packId,
    title: shell.title,
    client: shell.client,
    site: shell.site,
    siteId: shell.siteId,
    families: shell.families,
    officialRevisionId: shell.officialRevisionId,
    officialRevisionName: shell.officialRevisionName,
    extraTemplateIds: shell.extraTemplateIds,
    crewRanges: {},
    totalsLockedBy: "official-revision",
  };
}

export function seedMetadataForClass(classified: ClientWorkbookClass): WakeIngestSeed | null {
  if (!classified.packId) return null;
  const shell = wakeShellByPackId(classified.packId);
  if (!shell) return null;
  return wakeIngestSeed(shell);
}

export function clientFaceNames() {
  return [
    OFFICIAL_U110_REVISION_NAME,
    OFFICIAL_U250_REVISION_NAME,
    OFFICIAL_MONROE_541V_REVISION_NAME,
    OFFICIAL_BOILER17_B1_REVISION_NAME,
    RODEO_WORKBOOK_BLANK_NAME,
    RODEO_WORKBOOK_U110_NAME,
    RODEO_WORKBOOK_U250_NAME,
  ];
}

export function shouldStageClientWorkbook(classified: ClientWorkbookClass) {
  return classified.staged || classified.kind !== "hitsquad-live-pack";
}

export function knownClientFaceId(fileId = "") {
  return isOfficialRevisionId(fileId) || isRodeoWorkbookFamilyId(fileId);
}

/** Mapper spec: family → Hit Squad surfaces. Export later; ingest is staged. */
export const CLIENT_FACE_MAPPER_SPEC = {
  "madison-contractor": {
    family: "A",
    clock: "hours × one composite rate",
    buckets: ["Direct", "Indirect"],
    tabs: ["INSTRUCTIONS", "SUMMARY", "1–9"],
    exportAs: P66_V1_EXPORT_LINE,
    ingest: "stage-metadata",
  },
  "p66-rodeo-workbook": {
    family: "B",
    clock: "P66 RODEO ESTIMATE WORKBOOK",
    buckets: ["workbook modules — not collapsed into A"],
    tabs: ["Blank Needs Rates + filled unit books"],
    exportAs: "later face — estimate fills it when that workbook is in play; do not collapse into A",
    ingest: "stage-metadata",
  },
  "client-estimate-form": {
    family: "C",
    clock: "Client Estimate Form",
    buckets: ["U240 examples"],
    tabs: ["form family"],
    exportAs: "client form",
    ingest: "stage-metadata",
  },
  "monroe-workbook": {
    family: "monroe",
    clock: "Monroe 541V POST REVIEW workbook",
    buckets: ["official lock"],
    tabs: ["POST REVIEW"],
    exportAs: "Monroe workbook",
    ingest: "stage-metadata",
  },
  "wood-river-b1": {
    family: "wood-river-b1",
    clock: "Wood River B-1 Summary Page hours",
    buckets: ["Direct", "Foremen", "Support", "Staff"],
    tabs: ["Summary Page"],
    exportAs: "Hit Squad live pack — B-1 ingest stays staged",
    ingest: "stage-metadata",
  },
  "ferndale-gep": {
    family: "ferndale",
    clock: "GEP / TASO RFQ letter + EST workbook",
    buckets: ["live pack fill — unread RFX cells stay TODO"],
    tabs: ["RFQ letter", "GEP pack"],
    exportAs: "Ferndale RFQ pack hinge — estimate fills the letter/pack map; official EST workbook stays on Drive",
    ingest: "stage-metadata",
  },
} as const;
