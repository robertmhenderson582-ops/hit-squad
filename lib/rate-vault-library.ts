/**
 * Rate Vault source library — Drive ids + metadata only.
 * P66-exclusive catalog (Wood River / Bayway / Rodeo / Ferndale / Billings / East Coast COMP).
 * Never embed P66 / Madison / GPPMA / B-1 / wage-sheet binaries.
 */

import {
  type RateVaultSourceEntry,
  type RateVaultSourceKind,
  emptyRateVaultWorkshop,
  isRateVaultDriveId,
  isRateVaultSiteId,
  isRateVaultSourceKind,
  looksLikeForeignRateVaultSite,
  rateVaultDriveUrl,
  rateVaultPathHint,
  type RateVaultConfirmedReview,
  type RateVaultRecognitionReview,
  type RateVaultSiteId,
  type RateVaultSourceOverride,
  type RateVaultPreviewPackage,
  type RateVaultWorkshop,
} from "./rate-vault.ts";
import { defaultRateVaultPreview, WOOD_RIVER_B1_EXHIBIT_DRIVE_ID } from "./rate-vault-preview.ts";

export const RATE_VAULT_LIBRARY_NAME = "rate-vault.json";
export const RATE_VAULT_LIBRARY_KIND = "rate-vault-library";

type SeedRow = {
  driveId: string;
  title: string;
  kind: RateVaultSourceKind;
  driveKind?: "file" | "folder";
  siteId?: RateVaultSiteId | null;
  craft?: string | null;
  local?: string | null;
  primary?: boolean;
  archived?: boolean;
  note: string;
};

/** Default catalog. Non-P66 books (Monroe / Yates) stay out of this list. */
const SEED: readonly SeedRow[] = [
  {
    driveId: "17YtnXtCcIXq68sROl3_VwkIo6PHYzTIR",
    title: "GPPMA-Agreement-Bookv10 (1).pdf",
    kind: "gppma",
    siteId: "wood-river",
    note: "GPPMA agreement book — Wood River / Illinois. Latest indexed copy.",
  },
  {
    driveId: "1bhDSXSP1huQEOifr6f9ZeRhNje9cXZ42",
    title: "WA AGC Local 302 MLA_2024 - 2027.pdf",
    kind: "cba",
    siteId: "ferndale",
    local: "302",
    note: "Washington AGC Local 302 MLA 2024–2027.",
  },
  {
    driveId: "1nUCFfLflJDT7N5NRY2h22vRzWYxMt_mX",
    title: "WA AGC Local 302 Schedule A",
    kind: "local-craft-sheet",
    siteId: "ferndale",
    local: "302",
    note: "Schedule A companion to the Local 302 MLA.",
  },
  {
    driveId: "1JzCBSqwJGU8qKTWFn2DKGrGKfOSTXan6",
    title: "PCA0001103-2025-2027 GMTA-Madison-Amendment 1.pdf",
    kind: "comp",
    siteId: "east-coast",
    note: "East Coast COMP / GMTA Madison Amendment 1 (PCA0001103).",
  },
  {
    // TODO: replace WOOD_RIVER_B1_EXHIBIT_DRIVE_ID with the Drive file id after Robert's 09.10.26 Exhibit B-1 is uploaded. Catalog by id only — never commit the xlsx.
    driveId: WOOD_RIVER_B1_EXHIBIT_DRIVE_ID,
    title: "Wood River Exhibit B-1 latest (Robert 09.10.26)",
    kind: "b1-exhibit",
    siteId: "wood-river",
    primary: true,
    note: "Primary Wood River Exhibit B-1 (Robert 09.10.26). Metadata only — file stays on Drive. Visual package loads from the checked-in preview fixture.",
  },
  {
    driveId: "1aP0etQYJxWo003IUa8bVWWoDpOAwk1m2",
    title: "PF - L 553 WRR 2025 P66 Wage Rate Sheet Expires 12.31.25.pdf",
    kind: "local-craft-sheet",
    siteId: "wood-river",
    craft: "Pipefitter",
    local: "553",
    note: "Wood River pipefitter Local 553 wage sheet. Expires 12.31.25.",
  },
  {
    driveId: "1uw4jwmCB0iPmoC_HJH-xce5A308NsNe5",
    title: "BM-L363 WRR P66 2025 Wage Sheet Expires 12.31.25.xlsx",
    kind: "local-craft-sheet",
    siteId: "wood-river",
    craft: "Boilermaker",
    local: "363",
    note: "Wood River boilermaker Local 363 wage sheet. Expires 12.31.25.",
  },
  {
    driveId: "1X1F7HnMLkAXMCq3VZESPMtSZ83eZCmu4",
    title: "Labor Wage Sheets",
    kind: "local-craft-sheet",
    driveKind: "folder",
    note: "Labor wage-sheet folder. Room for more hall sheets — catalog by Drive id.",
  },
  {
    driveId: "1EpxaHxTdy6I0H4YV4scosap4PfkoWjiT",
    title: "Rodeo Exhibit B-1 Bryan FINAL 08.06.26.xlsx",
    kind: "b1-exhibit",
    siteId: "rodeo",
    primary: true,
    note: "Latest indexed Rodeo Exhibit B-1. Metadata only — file stays on Drive.",
  },
  {
    driveId: "1Tl__EcHbjt4Vv5849MYJk9Yc-6q4QXgl",
    title: "Bayway Exhibit B-1 UPDATED OE 08.20.26 DB.xlsb",
    kind: "b1-exhibit",
    siteId: "bayway",
    primary: true,
    note: "Latest indexed Bayway Exhibit B-1. Metadata only.",
  },
  {
    driveId: "15SH7BjS8yEQRO8u34uMaF6EHBXQcgovm",
    title: "Bayway Madison TM Rev 7.1.26.xlsb",
    kind: "b1-exhibit",
    siteId: "bayway",
    primary: false,
    archived: true,
    note: "Superseded by Bayway Exhibit B-1 08.20.26. Kept for path history — not primary.",
  },
  {
    driveId: "1S3Azwo8UcUnhE7pGaQ566x-wUyk8EMaT",
    title: "Rate Sheet Builder Bayway 08.27.26.xlsx",
    kind: "rate-builder",
    siteId: "bayway",
    primary: true,
    note: "Bayway rate-sheet builder exemplar. Metadata only.",
  },
  {
    driveId: "1hvb5i1lYsIxcCzJcyTxDjWKCvyzv338B",
    title: "Exhibit C-1 Madison Rate Sheet (2026-06) V2.15 Final.xlsm",
    kind: "b1-exhibit",
    siteId: "east-coast",
    primary: true,
    note: "Madison Exhibit C-1 rate sheet V2.15. Companion face — not a silent B-1 overwrite.",
  },
  {
    driveId: "15zFicxrF46616pD3ljvjOAduAVfi6-rH",
    title: "Exhibit C - Union Comp Terms V2.2.docx",
    kind: "union-terms",
    siteId: "east-coast",
    note: "Union COMP terms (Exhibit C). Word source — review before mapping.",
  },
  {
    driveId: "15bDYldQYfnWQSESTgxuoAvlWo55w4lrq",
    title: "Union Files",
    kind: "other",
    driveKind: "folder",
    note: "Union Files folder. Catalog more hall books from here.",
  },
  {
    driveId: "1DR80tcSvBnP9GJU8zEs2iNhLb4V8liYP",
    title: "CBA talk",
    kind: "cba",
    driveKind: "folder",
    note: "CBA talk folder ref.",
  },
];

function seedEntry(row: SeedRow): RateVaultSourceEntry {
  const driveKind = row.driveKind ?? "file";
  return {
    id: row.driveId,
    title: row.title,
    driveId: row.driveId,
    driveKind,
    href: rateVaultDriveUrl(row.driveId, driveKind),
    kind: row.kind,
    siteId: row.siteId ?? null,
    craft: row.craft ?? null,
    local: row.local ?? null,
    primary: row.primary !== false && !row.archived,
    archived: Boolean(row.archived),
    origin: "seed",
    confirmed: false,
    note: row.note,
    pathHint: rateVaultPathHint({
      siteId: row.siteId ?? null,
      craft: row.craft ?? null,
      local: row.local ?? null,
      kind: row.kind,
    }),
  };
}

export function isAllowedRateVaultSource(entry: Pick<RateVaultSourceEntry, "title" | "note" | "siteId" | "pathHint">) {
  if (entry.siteId && !isRateVaultSiteId(entry.siteId)) return false;
  return !looksLikeForeignRateVaultSite([entry.title, entry.note, entry.siteId, entry.pathHint].filter(Boolean).join(" "));
}

export function seedRateVaultLibrary(): RateVaultSourceEntry[] {
  return SEED.map(seedEntry).filter(isAllowedRateVaultSource);
}

export function seedRateVaultDriveIds() {
  return seedRateVaultLibrary().map((row) => row.driveId);
}

export function findSeedRateVaultSource(driveId: string) {
  const id = driveId.trim();
  return seedRateVaultLibrary().find((row) => row.driveId === id) ?? null;
}

export type RateVaultLibraryFilter = {
  siteId?: string | null;
  kind?: string | null;
  craft?: string | null;
  q?: string | null;
  includeArchived?: boolean;
};

const CRAFT_ALIASES: Record<string, string[]> = {
  pf: ["pipefitter", "pipe fitter", "pf", "ua"],
  pipefitter: ["pipefitter", "pipe fitter", "pf"],
  bm: ["boilermaker", "boiler maker", "bm"],
  boilermaker: ["boilermaker", "boiler maker", "bm"],
};

function craftNeedles(value: string) {
  const key = value.trim().toLowerCase();
  return CRAFT_ALIASES[key] ?? [key];
}

export function sourceMatchesCraft(entry: RateVaultSourceEntry, craft: string) {
  const raw = craft.trim();
  if (!raw) return true;
  const hay = [entry.craft, entry.local, entry.title, entry.pathHint, entry.note]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return craftNeedles(raw).some((needle) => hay.includes(needle) || hay.includes(`l ${needle}`) || hay.includes(`l-${needle}`));
}

export function filterRateVaultLibrary(entries: readonly RateVaultSourceEntry[], filter: RateVaultLibraryFilter = {}) {
  const siteId = filter.siteId?.trim() || "";
  const kind = filter.kind?.trim() || "";
  const craft = filter.craft?.trim() || "";
  const q = filter.q?.trim().toLowerCase() || "";
  return entries.filter((entry) => {
    if (!filter.includeArchived && entry.archived) return false;
    if (siteId && entry.siteId !== siteId) return false;
    if (kind && entry.kind !== kind) return false;
    if (craft && !sourceMatchesCraft(entry, craft)) return false;
    if (!q) return true;
    const hay = [entry.title, entry.note, entry.craft, entry.local, entry.pathHint, entry.driveId, entry.kind]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function applyRateVaultReview(
  entry: RateVaultSourceEntry,
  review: { sourceId: string; kind: RateVaultSourceKind; siteId: string | null; craft: string | null; local: string | null } | null,
): RateVaultSourceEntry {
  if (!review || review.sourceId !== entry.id) return entry;
  const next: RateVaultSourceEntry = {
    ...entry,
    kind: review.kind,
    siteId: isRateVaultSiteId(review.siteId) ? review.siteId : null,
    craft: review.craft,
    local: review.local,
    confirmed: true,
    pathHint: "",
  };
  return { ...next, pathHint: rateVaultPathHint(next) };
}

export function applyRateVaultOverride(
  entry: RateVaultSourceEntry,
  override: RateVaultSourceOverride | null,
): RateVaultSourceEntry {
  if (!override || override.sourceId !== entry.id) return entry;
  const next: RateVaultSourceEntry = {
    ...entry,
    kind: override.kind ?? entry.kind,
    siteId: override.siteId !== undefined ? (isRateVaultSiteId(override.siteId) ? override.siteId : null) : entry.siteId,
    pathHint: "",
  };
  return { ...next, pathHint: rateVaultPathHint(next) };
}

export function mergeRateVaultLibrary(
  seed: readonly RateVaultSourceEntry[],
  extras: readonly RateVaultSourceEntry[] = [],
  reviews: ReadonlyArray<{ sourceId: string; kind: RateVaultSourceKind; siteId: string | null; craft: string | null; local: string | null }> = [],
  overrides: readonly RateVaultSourceOverride[] = [],
) {
  const byId = new Map<string, RateVaultSourceEntry>();
  for (const row of seed) byId.set(row.id, { ...row });
  for (const row of extras) byId.set(row.id, { ...row });
  return [...byId.values()]
    .map((entry) => {
      const review = reviews.find((item) => item.sourceId === entry.id) ?? null;
      const override = overrides.find((item) => item.sourceId === entry.id) ?? null;
      return applyRateVaultOverride(applyRateVaultReview(entry, review), override);
    })
    .filter(isAllowedRateVaultSource);
}

export function parseOwnerLibraryInput(raw: unknown): Omit<RateVaultSourceEntry, "href" | "pathHint" | "origin" | "confirmed"> | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Add a Drive id and a title." };
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const driveId = typeof row.driveId === "string" ? row.driveId.trim() : "";
  if (!title) return { error: "Add a title." };
  if (!isRateVaultDriveId(driveId)) return { error: "Drive id looks wrong." };
  const kind = isRateVaultSourceKind(row.kind) ? row.kind : "other";
  const driveKind = row.driveKind === "folder" ? "folder" : "file";
  const siteId = isRateVaultSiteId(row.siteId) ? row.siteId : null;
  const craft = typeof row.craft === "string" && row.craft.trim() ? row.craft.trim() : null;
  const local = typeof row.local === "string" && row.local.trim() ? row.local.replace(/^l(?:ocal)?[\s-]*/i, "").trim() : null;
  const note = typeof row.note === "string" ? row.note.trim() : "";
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : driveId;
  return {
    id,
    title,
    driveId,
    driveKind,
    kind,
    siteId,
    craft,
    local,
    primary: row.primary !== false && row.archived !== true,
    archived: row.archived === true,
    note: note || "Owner-linked Drive source. Metadata only.",
  };
}

export function ownerLibraryEntry(
  input: Omit<RateVaultSourceEntry, "href" | "pathHint" | "origin" | "confirmed">,
): RateVaultSourceEntry {
  const entry: RateVaultSourceEntry = {
    ...input,
    href: rateVaultDriveUrl(input.driveId, input.driveKind),
    origin: "owner",
    confirmed: false,
    pathHint: "",
  };
  return { ...entry, pathHint: rateVaultPathHint(entry) };
}

export function libraryHasKind(entries: readonly RateVaultSourceEntry[], kind: RateVaultSourceKind) {
  return entries.some((row) => row.kind === kind);
}

export function libraryHasSite(entries: readonly RateVaultSourceEntry[], siteId: RateVaultSiteId) {
  return entries.some((row) => row.siteId === siteId);
}

export function buildRateVaultWorkshop(
  extras: readonly RateVaultSourceEntry[] = [],
  reviews: readonly RateVaultConfirmedReview[] = [],
  review: RateVaultRecognitionReview | null = null,
  overrides: readonly RateVaultSourceOverride[] = [],
  preview: RateVaultPreviewPackage | null = defaultRateVaultPreview(review?.guessedSiteId ?? "wood-river"),
): RateVaultWorkshop {
  const workshop = emptyRateVaultWorkshop();
  return {
    ...workshop,
    library: {
      entries: mergeRateVaultLibrary(seedRateVaultLibrary(), extras, reviews, overrides),
      extras: extras.map((row) => ({ ...row })),
      reviews: reviews.map((row) => ({ ...row })),
      overrides: overrides.map((row) => ({ ...row })),
    },
    review,
    preview,
  };
}
