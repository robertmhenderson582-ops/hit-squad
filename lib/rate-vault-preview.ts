/**
 * Rate Vault visual B-1 preview — typed package + Wood River fixture loader.
 * Binaries stay on Drive. This module never writes live estimate Rate Tables.
 */

import woodRiverB1PreviewJson from "./rate-vault/wood-river-b1-preview-fixture.json" with { type: "json" };
import {
  isRateVaultSiteId,
  type RateVaultColumnRole,
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

/** TODO: replace with the Drive file id after Robert's 09.10.26 Exhibit B-1 is uploaded. Catalog by id only — never commit the xlsx. */
export const WOOD_RIVER_B1_EXHIBIT_DRIVE_ID = "1WOODRIVERB1LATESTPENDING000";

export const WOOD_RIVER_B1_EXHIBIT_TITLE = "Wood River Exhibit B-1 latest (Robert 09.10.26)";

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

function parseBurdenLine(raw: unknown, index: number) {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const label = text(row.label);
  if (!label) return null;
  return {
    id: text(row.id) || `burden-${index + 1}`,
    label,
    ratePct: money(row.ratePct),
    note: text(row.note) || "",
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
  const burden = Array.isArray(row.burden)
    ? row.burden.map(parseBurdenLine).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
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
    burden,
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

export function mergePreviewFace(
  stored: RateVaultPreviewPackage | null,
  incoming: RateVaultPreviewPackage,
  face: RateVaultOcipFace,
): RateVaultPreviewPackage {
  if (!stored) return { ...cloneRateVaultPreview(incoming), ocipFace: incoming.ocipFace === "both" ? "both" : face };
  const kept = stored.rows.filter((row) => !rowMatchesOcipFace(row, face));
  const nextRows = [...kept, ...incoming.rows.filter((row) => rowMatchesOcipFace(row, face))];
  const blended = nextRows.some((row) => {
    const prior = stored.rows.find((item) => item.id === row.id);
    return Boolean(prior && prior.lane !== row.lane);
  });
  if (blended) {
    return { ...cloneRateVaultPreview(stored) };
  }
  return {
    ...cloneRateVaultPreview(incoming),
    id: stored.id,
    siteId: stored.siteId,
    ocipFace: kept.length && incoming.rows.some((row) => rowMatchesOcipFace(row, face)) ? "both" : face,
    rows: nextRows,
    burden: incoming.burden.length ? incoming.burden : stored.burden,
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
    burdenPct: burdenTotalPct(preview),
  };
}

let cachedWoodRiver: RateVaultPreviewPackage | null = null;

export function loadWoodRiverB1PreviewFixture(): RateVaultPreviewPackage {
  if (cachedWoodRiver) return { ...cachedWoodRiver, rows: cachedWoodRiver.rows.map((row) => ({ ...row })), burden: cachedWoodRiver.burden.map((row) => ({ ...row })), sheets: cachedWoodRiver.sheets.map((row) => ({ ...row })) };
  const parsed = parseRateVaultPreviewPackage(woodRiverB1PreviewJson);
  if ("error" in parsed) throw new Error(parsed.error);
  cachedWoodRiver = parsed;
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
  const rateSheets = preview.sheets.filter((sheet) => sheet.kind !== "burden-summary");
  const burden = preview.sheets.find((sheet) => sheet.kind === "burden-summary");
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
      headers: ["Burden item", "Rate %", "Note"],
      columns: [
        { header: "Burden item", role: "burden" },
        { header: "Rate %", role: "unknown" },
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
  if (!preview) return 0;
  return money(preview.burden.reduce((sum, row) => sum + row.ratePct, 0));
}

export function cloneRateVaultPreview(preview: RateVaultPreviewPackage): RateVaultPreviewPackage {
  return {
    ...preview,
    writesRateBook: false,
    ocipFace: preview.ocipFace || "both",
    version: preview.version ? { ...preview.version } : null,
    sheets: preview.sheets.map((sheet) => ({ ...sheet })),
    burden: preview.burden.map((row) => ({ ...row })),
    rows: preview.rows.map((row) => ({ ...row })),
  };
}
