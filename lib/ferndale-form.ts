/**
 * Ferndale GEP / TASO client template — RFQ letter + pack hinge.
 * Not a Rodeo clone. Site-scoped tab only. Live pack dollars only.
 * Unread workbook cells stay TODO on Work Folder Drive ids.
 */

import { deskPackageBreakdown, type DeskPackageInput } from "./estimate-desk-total.ts";
import {
  FERNDALE_ADDRESS,
  FERNDALE_CLIENT,
  FERNDALE_CLIENT_TEMPLATE_PARKED,
  FERNDALE_COAST,
  FERNDALE_COMP_AMENDMENT,
  FERNDALE_ESTIMATE_WORKBOOK_ID,
  FERNDALE_LETTER_ADDRESSEE,
  FERNDALE_LETTER_ADDRESSEE_TITLE,
  FERNDALE_LETTER_CONTRACTOR,
  FERNDALE_MSA,
  FERNDALE_PCA,
  FERNDALE_PILE_FOLDER_IDS,
  FERNDALE_PLANT,
  FERNDALE_PROPOSAL_MANUAL_ID,
  FERNDALE_RFQ_LETTER_ID,
  FERNDALE_RFX_SOURCES,
  FERNDALE_TASO_PSO,
  FERNDALE_WORK_FOLDER_ID,
  FERNDALE_WORK_PILES,
  ferndaleRfxFromText,
  ferndaleWorkbookTodos,
  type FerndaleWorkPile,
} from "./ferndale-work.ts";
import { buildXlsx, type SheetCell } from "./xlsx-minimal.ts";

export const FERNDALE_TAB_ID = "ferndale";
export const FERNDALE_TAB_LABEL = "Ferndale";
export const FERNDALE_FILL_ERROR = "Could not fill the Ferndale RFQ pack. Try again.";

const HIDDEN_FERNDALE_SITES = ["wood river", "bayway", "rodeo", "billings", "yates", "monroe"];

export type FerndaleFormState = {
  scope: string;
  rfx: string;
  addressee: string;
  addresseeTitle: string;
  contractor: string;
  pile: FerndaleWorkPile | "";
  notes: string;
};

export type FerndaleRfxResolve = {
  rfx: string;
  source: "form" | "work-folder" | "todo";
  todo?: string;
  label?: string;
};

const HIDDEN_RODEO_HINT = HIDDEN_FERNDALE_SITES;

export function emptyFerndaleForm(): FerndaleFormState {
  return {
    scope: "",
    rfx: "",
    addressee: FERNDALE_LETTER_ADDRESSEE,
    addresseeTitle: FERNDALE_LETTER_ADDRESSEE_TITLE,
    contractor: FERNDALE_LETTER_CONTRACTOR,
    pile: "",
    notes: "",
  };
}

export function hydrateFerndaleForm(
  raw: Partial<FerndaleFormState> | Record<string, unknown> | null | undefined,
): FerndaleFormState {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pile = typeof row.pile === "string" && FERNDALE_WORK_PILES.includes(row.pile as FerndaleWorkPile)
    ? (row.pile as FerndaleWorkPile)
    : "";
  return {
    scope: typeof row.scope === "string" ? row.scope : "",
    rfx: typeof row.rfx === "string" ? row.rfx.trim() : "",
    addressee: typeof row.addressee === "string" && row.addressee.trim() ? row.addressee : FERNDALE_LETTER_ADDRESSEE,
    addresseeTitle:
      typeof row.addresseeTitle === "string" && row.addresseeTitle.trim()
        ? row.addresseeTitle
        : FERNDALE_LETTER_ADDRESSEE_TITLE,
    contractor:
      typeof row.contractor === "string" && row.contractor.trim() ? row.contractor : FERNDALE_LETTER_CONTRACTOR,
    pile,
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export function isFerndaleSite(site = "", client = "") {
  const hay = `${site} ${client}`.toLowerCase();
  if (HIDDEN_RODEO_HINT.some((name) => hay.includes(name))) return false;
  return /\bferndale\b|site-ferndale/.test(hay);
}

export function showsFerndaleTab(site = "", client = "") {
  if (FERNDALE_CLIENT_TEMPLATE_PARKED) return false;
  return isFerndaleSite(site, client);
}

export function resolveFerndaleRfx(formRfx = "", title = ""): FerndaleRfxResolve {
  const typed = formRfx.trim();
  if (typed) {
    const known = ferndaleRfxFromText(typed);
    return { rfx: typed, source: "form", label: known?.label };
  }
  const mapped = ferndaleRfxFromText(title);
  if (mapped) {
    return { rfx: mapped.rfx, source: "work-folder", label: mapped.label };
  }
  return {
    rfx: "",
    source: "todo",
    todo: `TODO: map RFX from Work Folder ${FERNDALE_WORK_FOLDER_ID}`,
  };
}

export function ferndaleLetterSubject(scope: string, rfx: FerndaleRfxResolve) {
  const work = scope.trim() || "2028 Ferndale Major Turnaround";
  if (rfx.rfx) return `Formal Proposal — ${work} (RFP Reference: ${rfx.rfx})`;
  return `Formal Proposal — ${work} (${rfx.todo})`;
}

export function ferndaleLivePackFill(input: DeskPackageInput) {
  const breakdown = deskPackageBreakdown(input);
  return {
    lines: breakdown.lines,
    hours: breakdown.hours,
    total: Math.round(breakdown.total * 100) / 100,
    note: "Live pack totals — not an official RFX / GEP dollar lock.",
  };
}

export function ferndaleFillMap(input: {
  form: FerndaleFormState;
  pack: DeskPackageInput;
  title?: string;
}): { cells: SheetCell[]; rfx: FerndaleRfxResolve; live: ReturnType<typeof ferndaleLivePackFill> } {
  const form = hydrateFerndaleForm(input.form);
  const title = input.title || "";
  const rfx = resolveFerndaleRfx(form.rfx, `${form.scope} ${title}`);
  const live = ferndaleLivePackFill(input.pack);
  const pileFolder = form.pile ? FERNDALE_PILE_FOLDER_IDS[form.pile] : FERNDALE_WORK_FOLDER_ID;
  const cells: SheetCell[] = [
    { ref: "A1", type: "text", value: "HIT SQUAD / PROJECT CONTROLS" },
    { ref: "A2", type: "text", value: "Ferndale GEP / TASO hinge — RFQ letter + pack. Not a Rodeo clone." },
    { ref: "A3", type: "text", value: live.note },
    { ref: "A5", type: "text", value: "CONTRACTOR" },
    { ref: "B5", type: "text", value: form.contractor },
    { ref: "A6", type: "text", value: "CLIENT" },
    { ref: "B6", type: "text", value: input.pack.client || FERNDALE_CLIENT },
    { ref: "A7", type: "text", value: "SITE" },
    { ref: "B7", type: "text", value: input.pack.site || FERNDALE_PLANT },
    { ref: "A8", type: "text", value: "ADDRESS" },
    { ref: "B8", type: "text", value: FERNDALE_ADDRESS },
    { ref: "A9", type: "text", value: "COMP" },
    { ref: "B9", type: "text", value: FERNDALE_COAST },
    { ref: "A10", type: "text", value: "PCA" },
    { ref: "B10", type: "text", value: FERNDALE_PCA },
    { ref: "A11", type: "text", value: "AMENDMENT" },
    { ref: "B11", type: "number", value: FERNDALE_COMP_AMENDMENT },
    { ref: "A12", type: "text", value: "MSA" },
    { ref: "B12", type: "text", value: FERNDALE_MSA },
    { ref: "A13", type: "text", value: "TASO PSO" },
    { ref: "B13", type: "text", value: FERNDALE_TASO_PSO },
    { ref: "A15", type: "text", value: "ADDRESSEE" },
    { ref: "B15", type: "text", value: form.addressee },
    { ref: "A16", type: "text", value: "TITLE" },
    { ref: "B16", type: "text", value: form.addresseeTitle },
    { ref: "A17", type: "text", value: "SCOPE" },
    { ref: "B17", type: "text", value: form.scope || title },
    { ref: "A18", type: "text", value: "RFX" },
    { ref: "B18", type: "text", value: rfx.rfx || rfx.todo || "" },
    { ref: "A19", type: "text", value: "SUBJECT" },
    { ref: "B19", type: "text", value: ferndaleLetterSubject(form.scope || title, rfx) },
    { ref: "A20", type: "text", value: "WORK PILE" },
    { ref: "B20", type: "text", value: form.pile || "TODO: pick 2028 TASO / GEP Response / Invitation to Bid / Submitted" },
    { ref: "A21", type: "text", value: "PILE FOLDER" },
    { ref: "B21", type: "text", value: pileFolder },
    { ref: "A22", type: "text", value: "RFQ LETTER SHAPE" },
    { ref: "B22", type: "text", value: FERNDALE_RFQ_LETTER_ID },
    { ref: "A23", type: "text", value: "PROPOSAL MANUAL" },
    { ref: "B23", type: "text", value: FERNDALE_PROPOSAL_MANUAL_ID },
    { ref: "A24", type: "text", value: "ESTIMATE WORKBOOK" },
    { ref: "B24", type: "text", value: FERNDALE_ESTIMATE_WORKBOOK_ID },
    { ref: "A26", type: "text", value: "LIVE PACK LINE" },
    { ref: "B26", type: "text", value: "AMOUNT" },
    { ref: "A27", type: "text", value: "Hours" },
    { ref: "B27", type: "number", value: live.hours },
  ];
  live.lines.forEach((line, index) => {
    const excelRow = 28 + index;
    cells.push({ ref: `A${excelRow}`, type: "text", value: line.label });
    cells.push({ ref: `B${excelRow}`, type: "number", value: line.amount });
  });
  const totalRow = 28 + live.lines.length;
  cells.push({ ref: `A${totalRow}`, type: "text", value: "Live pack total" });
  cells.push({ ref: `B${totalRow}`, type: "number", value: live.total });
  const todoStart = totalRow + 2;
  cells.push({ ref: `A${todoStart}`, type: "text", value: "WORK FOLDER TODOS" });
  ferndaleWorkbookTodos().forEach((todo, index) => {
    cells.push({ ref: `A${todoStart + 1 + index}`, type: "text", value: todo });
  });
  if (form.notes.trim()) {
    cells.push({ ref: `A${todoStart + 6}`, type: "text", value: "NOTES" });
    cells.push({ ref: `B${todoStart + 6}`, type: "text", value: form.notes });
  }
  return { cells, rfx, live };
}

export async function ferndaleFormToXlsx(input: {
  form: FerndaleFormState;
  pack: DeskPackageInput;
  title?: string;
}): Promise<Uint8Array> {
  const { cells } = ferndaleFillMap(input);
  const bytes = await buildXlsx("Ferndale RFQ", cells);
  if (!bytes.byteLength) throw new Error("empty-ferndale-form");
  return bytes;
}

export function ferndaleFormFilename(title = "") {
  const base = (title || "Ferndale-RFQ").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `Ferndale-RFQ-${base || "Ferndale-RFQ"}.xlsx`;
}

export function ferndaleKnownRfxLabels() {
  return FERNDALE_RFX_SOURCES.map((row) => `${row.rfx} · ${row.label}`);
}
