/**
 * Rate Vault visual B-1 preview — typed package + Wood River fixture loader.
 * Binaries stay on Drive. This module never writes live estimate Rate Tables.
 */

import woodRiverB1PreviewJson from "./rate-vault/wood-river-b1-preview-fixture.json" with { type: "json" };
import {
  applyB1ToPreviewRows,
  b1PayTaxPct,
  craftSheetsFromFlat,
  flattenB1Burden,
  flattenB1Fringes,
  inferBurdenFamily,
  inferBurdenUnit,
  isRateVaultBurdenFamily,
  ripplePreviewRowsFromB1Sheets,
} from "./rate-vault-b1.ts";
import { woodRiverB1CraftSheets } from "./rate-vault-wood-river-b1.ts";
import {
  isRateVaultSiteId,
  type RateVaultBurdenFamily,
  type RateVaultBurdenLine,
  type RateVaultBurdenUnit,
  type RateVaultColumnRole,
  type RateVaultCraftSheet,
  type RateVaultFringeLine,
  type RateVaultLane,
  type RateVaultOcipFace,
  type RateVaultPackageVersion,
  type RateVaultPreviewPackage,
  type RateVaultPreviewRow,
  type RateVaultPreviewSheet,
  type RateVaultRecognitionReview,
  type RateVaultSheetSniff,
  type RateVaultSiteId,
  type RateVaultSourceEntry,
  type RateVaultSourceKind,
} from "./rate-vault.ts";

export const WOOD_RIVER_B1_PREVIEW_FIXTURE_PATH = "lib/rate-vault/wood-river-b1-preview-fixture.json";

/** Wood River RRFF Labor Burden Buildup — catalog by Drive id only. Never commit the xlsx. Not the TM labor-burden face. */
export const WOOD_RIVER_B1_EXHIBIT_DRIVE_ID = "1HN5FclxjQNw0iHm_hizHbcWM9GZV_Zeu";

export const WOOD_RIVER_B1_EXHIBIT_TITLE = "Wood River Exhibit B-1 RRFF Labor Burden Buildup";

export const RATE_VAULT_PREVIEW_COLUMNS: Array<{ header: string; role: RateVaultColumnRole }> = [
  { header: "Craft", role: "craft" },
  { header: "Position", role: "position" },
  { header: "Base Wage", role: "wage" },
  { header: "Fringe", role: "fringe" },
  { header: "Burden", role: "burden" },
  { header: "Bill Rate", role: "bill" },
];

const MONEY_TOL = 0.03;

function money(value: unknown) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? Math.round(next * 100) / 100 : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function formatRateVaultMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRateVaultPct(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function previewRowAddsUp(row: Pick<RateVaultPreviewRow, "wage" | "fringe" | "burden" | "billRate">) {
  return Math.abs(row.wage + row.fringe + row.burden - row.billRate) <= MONEY_TOL;
}

function parseSheet(raw: unknown): RateVaultPreviewSheet | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = text(row.name);
  if (!name) return null;
  return {
    name,
    kind: text(row.kind) || "other",
  };
}

export function inferRateVaultLane(input: { craft?: string | null; group?: string | null; sheet?: string | null }): RateVaultLane {
  return /merit/i.test([input.craft, input.group, input.sheet].filter(Boolean).join(" ")) ? "merit" : "union";
}

export function inferRateVaultOcip(input: { group?: string | null; sheet?: string | null; kind?: string | null }) {
  return /ocip/i.test([input.group, input.sheet, input.kind].filter(Boolean).join(" "));
}

export function defaultRateVaultClockNote(lane: RateVaultLane) {
  return lane === "merit" ? "Staff clock" : "OT after 8 · Sunday DT";
}

export function rowMatchesOcipFace(row: Pick<RateVaultPreviewRow, "ocip">, face: RateVaultOcipFace) {
  return face === "ocip" ? row.ocip : !row.ocip;
}

export function filterPreviewByFace(preview: RateVaultPreviewPackage, face: RateVaultOcipFace): RateVaultPreviewPackage {
  return {
    ...cloneRateVaultPreview(preview),
    ocipFace: face,
    rows: preview.rows.filter((row) => rowMatchesOcipFace(row, face)),
  };
}

function parsePreviewRow(raw: unknown, index: number): RateVaultPreviewRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const position = text(row.position);
  if (!position) return null;
  const sheet = text(row.sheet) || "Rate Summary";
  const group = text(row.group) || "Rate Summary";
  const craft = text(row.craft) || "Craft";
  const lane: RateVaultLane = row.lane === "merit" || row.lane === "union" ? row.lane : inferRateVaultLane({ craft, group, sheet });
  const ocip = typeof row.ocip === "boolean" ? row.ocip : inferRateVaultOcip({ group, sheet });
  const next: RateVaultPreviewRow = {
    id: text(row.id) || `row-${index + 1}`,
    sheet,
    group,
    craft,
    local: text(row.local) || null,
    position,
    wage: money(row.wage),
    fringe: money(row.fringe),
    burden: money(row.burden),
    billRate: money(row.billRate),
    billOt: row.billOt == null || row.billOt === "" ? null : money(row.billOt),
    billDt: row.billDt == null || row.billDt === "" ? null : money(row.billDt),
    lane,
    ocip,
    clockNote: text(row.clockNote) || defaultRateVaultClockNote(lane),
  };
  return next;
}

function parseBurdenLine(raw: unknown, index: number): RateVaultBurdenLine | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const label = text(row.label);
  if (!label) return null;
  const family: RateVaultBurdenFamily = isRateVaultBurdenFamily(row.family) ? row.family : inferBurdenFamily(label);
  const unit: RateVaultBurdenUnit = row.unit === "amount-hr" || row.unit === "pct-taxable" ? row.unit : inferBurdenUnit({
    family,
    unit: "pct-taxable",
    ratePct: money(row.ratePct),
    amountHr: money(row.amountHr),
  });
  return {
    id: text(row.id) || `burden-${index + 1}`,
    label,
    family,
    unit,
    ratePct: money(row.ratePct),
    amountHr: money(row.amountHr),
    note: text(row.note) || "",
    craft: text(row.craft) || null,
    local: text(row.local) || null,
    sheet: text(row.sheet) || null,
    ridesOt: row.ridesOt === true,
  };
}

function parseFringeLine(raw: unknown, index: number): RateVaultFringeLine | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const label = text(row.label);
  if (!label) return null;
  return {
    id: text(row.id) || `fringe-${index + 1}`,
    label,
    amountHr: money(row.amountHr),
    ratePct: money(row.ratePct),
    unit: row.unit === "pct-taxable" ? "pct-taxable" : "amount-hr",
    craft: text(row.craft) || "Craft",
    local: text(row.local) || null,
    sheet: text(row.sheet) || "Craft",
    note: text(row.note) || "",
    ridesOt: row.ridesOt === true,
  };
}

function parseCraftSheet(raw: unknown, index: number): RateVaultCraftSheet | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sheet = text(row.sheet);
  const craft = text(row.craft);
  if (!sheet || !craft) return null;
  const fringes = Array.isArray(row.fringes)
    ? row.fringes.map(parseFringeLine).filter((item): item is RateVaultFringeLine => Boolean(item))
    : [];
  const burden = Array.isArray(row.burden)
    ? row.burden.map(parseBurdenLine).filter((item): item is RateVaultBurdenLine => Boolean(item))
    : [];
  return {
    id: text(row.id) || `craft-sheet-${index + 1}`,
    sheet,
    craft,
    local: text(row.local) || null,
    lane: row.lane === "merit" ? "merit" : "union",
    group: text(row.group) || sheet,
    revision: text(row.revision) || null,
    effective: text(row.effective) || null,
    representativeWage: money(row.representativeWage),
    representativePosition: text(row.representativePosition) || craft,
    fringes,
    burden,
  };
}

export function parseRateVaultPreviewPackage(raw: unknown): RateVaultPreviewPackage | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Preview package is empty." };
  const row = raw as Record<string, unknown>;
  const title = text(row.title);
  const siteId = isRateVaultSiteId(row.siteId) ? row.siteId : null;
  if (!title) return { error: "Preview package needs a title." };
  if (!siteId) return { error: "Preview package needs a P66 site." };
  const rows = Array.isArray(row.rows) ? row.rows.map(parsePreviewRow).filter((item): item is RateVaultPreviewRow => Boolean(item)) : [];
  if (!rows.length) return { error: "Preview package needs rate rows." };
  const parsedSheets = Array.isArray(row.craftSheets)
    ? row.craftSheets.map(parseCraftSheet).filter((item): item is RateVaultCraftSheet => Boolean(item))
    : [];
  const burden = Array.isArray(row.burden)
    ? row.burden.map(parseBurdenLine).filter((item): item is RateVaultBurdenLine => Boolean(item))
    : [];
  const fringes = Array.isArray(row.fringes)
    ? row.fringes.map(parseFringeLine).filter((item): item is RateVaultFringeLine => Boolean(item))
    : [];
  const craftSheets = parsedSheets.length ? parsedSheets : craftSheetsFromFlat(burden, fringes, rows);
  const sheets = Array.isArray(row.sheets)
    ? row.sheets.map(parseSheet).filter((item): item is RateVaultPreviewSheet => Boolean(item))
    : [];
  return {
    id: text(row.id) || `${siteId}-b1-preview`,
    title,
    siteId,
    sourceId: text(row.sourceId) || null,
    sourceTitle: text(row.sourceTitle) || title,
    effective: text(row.effective) || null,
    revision: text(row.revision) || null,
    extractedFrom: text(row.extractedFrom) || "demo-seed",
    note: text(row.note),
    writesRateBook: false,
    fixture: row.fixture === true,
    ocipFace: row.ocipFace === "ocip" || row.ocipFace === "non-ocip" || row.ocipFace === "both" ? row.ocipFace : "both",
    version: parseVersion(row.version),
    sheets,
    craftSheets,
    burden: burden.length ? burden : flattenB1Burden(craftSheets),
    fringes: fringes.length ? fringes : flattenB1Fringes(craftSheets),
    rows,
  };
}

function parseVersion(raw: unknown): RateVaultPackageVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const at = text(row.at);
  if (!id || !at) return null;
  return { id, at, note: text(row.note) || "Imported B-1 Excel" };
}

export function stampRateVaultVersion(preview: RateVaultPreviewPackage, note: string, at = new Date().toISOString()): RateVaultPreviewPackage {
  return {
    ...cloneRateVaultPreview(preview),
    version: {
      id: `v-${at.slice(0, 19).replace(/[-:T]/g, "")}`,
      at,
      note: note.trim() || "Imported B-1 Excel",
    },
  };
}

/** A both-faces book replaces the stored package. Never default that book onto an OCIP-only merge. */
export function rateVaultImportMergeFace(incoming: Pick<RateVaultPreviewPackage, "ocipFace">): RateVaultOcipFace | "both" {
  return incoming.ocipFace === "ocip" || incoming.ocipFace === "non-ocip" ? incoming.ocipFace : "both";
}

export function mergePreviewFace(
  stored: RateVaultPreviewPackage | null,
  incoming: RateVaultPreviewPackage,
  face: RateVaultOcipFace | "both",
): RateVaultPreviewPackage {
  if (!stored || face === "both") {
    return { ...cloneRateVaultPreview(incoming), ocipFace: incoming.ocipFace === "both" || face === "both" ? "both" : face };
  }
  const kept = stored.rows.filter((row) => !rowMatchesOcipFace(row, face));
  const nextRows = [...kept, ...incoming.rows.filter((row) => rowMatchesOcipFace(row, face))];
  const blended = nextRows.some((row) => {
    const prior = stored.rows.find((item) => item.id === row.id);
    return Boolean(prior && prior.lane !== row.lane);
  });
  if (blended) {
    return { ...cloneRateVaultPreview(stored) };
  }
  const burden = incoming.burden.length ? incoming.burden : stored.burden;
  const fringes = incoming.fringes.length ? incoming.fringes : stored.fringes;
  const craftSheets = incoming.craftSheets.length ? incoming.craftSheets : stored.craftSheets;
  return {
    ...cloneRateVaultPreview(incoming),
    id: stored.id,
    siteId: stored.siteId,
    ocipFace: kept.length && incoming.rows.some((row) => rowMatchesOcipFace(row, face)) ? "both" : face,
    rows: ripplePreviewRowsFromB1Sheets(nextRows, burden, fringes, craftSheets),
    burden,
    fringes,
    craftSheets,
  };
}

export function previewHasLaneBlend(stored: RateVaultPreviewPackage | null, incoming: RateVaultPreviewPackage) {
  if (!stored) return false;
  return incoming.rows.some((row) => {
    const prior = stored.rows.find((item) => item.id === row.id);
    return Boolean(prior && prior.lane !== row.lane);
  });
}

export function rateVaultCompCheck(preview: RateVaultPreviewPackage) {
  return {
    positions: preview.rows.length,
    wageTotal: money(preview.rows.reduce((sum, row) => sum + row.wage, 0)),
    fringeTotal: money(preview.rows.reduce((sum, row) => sum + row.fringe, 0)),
    burdenTotal: money(preview.rows.reduce((sum, row) => sum + row.burden, 0)),
    billTotal: money(preview.rows.reduce((sum, row) => sum + row.billRate, 0)),
    burdenPct: b1PayTaxPct(preview),
  };
}

let cachedWoodRiver: RateVaultPreviewPackage | null = null;

export function loadWoodRiverB1PreviewFixture(): RateVaultPreviewPackage {
  if (cachedWoodRiver) return cloneRateVaultPreview(cachedWoodRiver);
  const parsed = parseRateVaultPreviewPackage(woodRiverB1PreviewJson);
  if ("error" in parsed) throw new Error(parsed.error);
  const craftSheets = parsed.craftSheets.length ? parsed.craftSheets : woodRiverB1CraftSheets();
  cachedWoodRiver = {
    ...parsed,
    craftSheets,
    rows: applyB1ToPreviewRows(parsed.rows, craftSheets),
    burden: parsed.burden.length ? parsed.burden : flattenB1Burden(craftSheets),
    fringes: parsed.fringes.length ? parsed.fringes : flattenB1Fringes(craftSheets),
  };
  return loadWoodRiverB1PreviewFixture();
}

export function isWoodRiverB1Source(input: {
  id?: string | null;
  driveId?: string | null;
  title?: string | null;
  fileName?: string | null;
  kind?: RateVaultSourceKind | "unknown" | null;
  siteId?: string | null;
} | null | undefined) {
  if (!input) return false;
  const id = [input.id, input.driveId].filter(Boolean).join(" ");
  if (id.includes(WOOD_RIVER_B1_EXHIBIT_DRIVE_ID)) return true;
  const hay = [input.title, input.fileName].filter(Boolean).join(" ");
  if (/wood\s*river/i.test(hay) && /exhibit\s*b[\s-]*1/i.test(hay)) return true;
  return input.kind === "b1-exhibit" && input.siteId === "wood-river";
}

export function resolveRateVaultPreview(input: {
  siteId?: string | null;
  source?: Pick<RateVaultSourceEntry, "id" | "driveId" | "title" | "kind" | "siteId"> | null;
  review?: Pick<RateVaultRecognitionReview, "sourceId" | "fileName" | "guessedKind" | "guessedSiteId"> | null;
} = {}): RateVaultPreviewPackage | null {
  const siteId = input.siteId ?? input.source?.siteId ?? input.review?.guessedSiteId ?? "wood-river";
  const woodRiver =
    isWoodRiverB1Source(input.source) ||
    isWoodRiverB1Source({
      id: input.review?.sourceId,
      title: input.review?.fileName,
      fileName: input.review?.fileName,
      kind: input.review?.guessedKind,
      siteId: input.review?.guessedSiteId,
    }) ||
    siteId === "wood-river";
  if (woodRiver && (siteId === "wood-river" || !siteId)) return loadWoodRiverB1PreviewFixture();
  return null;
}

export function previewSheetsFromPackage(preview: RateVaultPreviewPackage | null): RateVaultSheetSniff[] {
  if (!preview) return [];
  const headers = RATE_VAULT_PREVIEW_COLUMNS.map((column) => column.header);
  const rateSheets = preview.sheets.filter((sheet) => sheet.kind !== "burden-summary" && sheet.kind !== "fringes");
  const burden = preview.sheets.find((sheet) => sheet.kind === "burden-summary");
  const fringes = preview.sheets.find((sheet) => sheet.kind === "fringes");
  const out: RateVaultSheetSniff[] = rateSheets.map((sheet) => ({
    name: sheet.name,
    headerRow: 1,
    headers,
    columns: RATE_VAULT_PREVIEW_COLUMNS.map((column) => ({ ...column })),
  }));
  if (burden) {
    out.push({
      name: burden.name,
      headerRow: 1,
      headers: ["Family", "Item", "Rate %", "$ / hr", "Hall", "Note"],
      columns: [
        { header: "Family", role: "burden" },
        { header: "Item", role: "burden" },
        { header: "Rate %", role: "unknown" },
        { header: "$ / hr", role: "unknown" },
        { header: "Hall", role: "local" },
        { header: "Note", role: "unknown" },
      ],
    });
  }
  if (fringes) {
    out.push({
      name: fringes.name,
      headerRow: 1,
      headers: ["Hall", "Fringe", "$ / hr", "Note"],
      columns: [
        { header: "Hall", role: "local" },
        { header: "Fringe", role: "fringe" },
        { header: "$ / hr", role: "fringe" },
        { header: "Note", role: "unknown" },
      ],
    });
  }
  return out;
}

export function enrichReviewWithPreview(
  review: RateVaultRecognitionReview,
  preview: RateVaultPreviewPackage | null,
): RateVaultRecognitionReview {
  if (!preview || review.sheets.length) return review;
  const sheets = previewSheetsFromPackage(preview);
  if (!sheets.length) return review;
  return {
    ...review,
    sheets,
    snippets: review.snippets.length
      ? review.snippets
      : [preview.title, preview.note, ...preview.rows.slice(0, 3).map((row) => `${row.position} · ${formatRateVaultMoney(row.billRate)}`)].filter(Boolean),
    extractNote: review.extractNote.includes("no binary")
      ? "Linked Drive id — visual package loaded from the Wood River B-1 preview fixture. Confirm before mapping. Layouts are not universal."
      : review.extractNote,
  };
}

export function defaultRateVaultPreview(siteId: RateVaultSiteId | "" | null = "wood-river") {
  return siteId === "wood-river" || !siteId ? loadWoodRiverB1PreviewFixture() : null;
}

export function previewRowGroups(rows: readonly RateVaultPreviewRow[]) {
  const groups: Array<{ name: string; rows: RateVaultPreviewRow[] }> = [];
  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (!current || current.name !== row.group) groups.push({ name: row.group, rows: [row] });
    else current.rows.push(row);
  }
  return groups;
}

export function burdenTotalPct(preview: RateVaultPreviewPackage | null) {
  return b1PayTaxPct(preview);
}

export function cloneRateVaultPreview(preview: RateVaultPreviewPackage): RateVaultPreviewPackage {
  return {
    ...preview,
    writesRateBook: false,
    ocipFace: preview.ocipFace || "both",
    version: preview.version ? { ...preview.version } : null,
    sheets: preview.sheets.map((sheet) => ({ ...sheet })),
    craftSheets: (preview.craftSheets ?? []).map((sheet) => ({
      ...sheet,
      fringes: sheet.fringes.map((row) => ({ ...row })),
      burden: sheet.burden.map((row) => ({ ...row })),
    })),
    burden: preview.burden.map((row) => ({ ...row })),
    fringes: (preview.fringes ?? []).map((row) => ({ ...row })),
    rows: preview.rows.map((row) => ({ ...row })),
  };
}
