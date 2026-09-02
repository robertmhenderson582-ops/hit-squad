/**
 * Plant → Shahan / COMP wage book for Rates Wage lookup.
 * Crew costing still uses billed ST / OT / DT from the plant catalog.
 * Wage lookup shows Base wage (COMP Exhibit B-1 BW, or Shahan Base ST
 * on Monroe / Yates). Never treat billed ST as wage.
 */

import { BAYWAY_WAGE, MONROE_WAGE, WOOD_RIVER_WAGE, YATES_WAGE } from "./comp-wages.ts";
import { BAYWAY_BOOK_ID, BAYWAY_BOOK_LABEL, BAYWAY_CRAFT_PD, BAYWAY_LABOR, BAYWAY_MARKUP, BAYWAY_PLANT, BAYWAY_STAFF_PD } from "./shahan-bayway.ts";
import { FERNDALE_BOOK_ID, FERNDALE_BOOK_LABEL, FERNDALE_CRAFT_PD, FERNDALE_LABOR, FERNDALE_MARKUP, FERNDALE_PLANT, FERNDALE_STAFF_PD } from "./shahan-ferndale.ts";
import { MONROE_BOOK_ID, MONROE_BOOK_LABEL, MONROE_CRAFT_PD, MONROE_LABOR, MONROE_MARKUP, MONROE_PLANT, MONROE_STAFF_PD } from "./shahan-monroe.ts";
import { RODEO_BOOK_ID, RODEO_BOOK_LABEL, RODEO_CRAFT_PD, RODEO_LABOR, RODEO_MARKUP, RODEO_PLANT, RODEO_STAFF_PD } from "./shahan-rodeo.ts";
import {
  NO_COMP_WAGE_MESSAGE,
  SHAHAN_BOOK_ID,
  SHAHAN_BOOK_LABEL,
  SHAHAN_CRAFT_PD,
  SHAHAN_LABOR,
  SHAHAN_NO_BOOK_MESSAGE,
  SHAHAN_PLANT,
  SHAHAN_STAFF_PD,
  formatDeskDollars,
  type JobRates,
  type ShahanLaborRow,
  type ShahanLookupOpts,
} from "./shahan-wood-river.ts";
import { YATES_BOOK_ID, YATES_BOOK_LABEL, YATES_CRAFT_PD, YATES_LABOR, YATES_MARKUP, YATES_PLANT, YATES_STAFF_PD } from "./shahan-yates.ts";

export const WOOD_RIVER_SITE_ID = "site-madison";
export const YATES_SITE_ID = "site-yates";
export const RODEO_SITE_ID = "site-rodeo";
export const BAYWAY_SITE_ID = "site-bayway";
export const FERNDALE_SITE_ID = "site-ferndale";
export const BILLINGS_SITE_ID = "site-billings";
export const MONROE_SITE_ID = "site-monroe";

export const EAST_COAST_PCA = "PCA0001103";
export const WEST_COAST_PCA = "PCA0001100";
export const EAST_COAST_AMENDMENT = 11;
export const WEST_COAST_AMENDMENT = 8;
export const COMP_EFFECTIVE = "2026-09-01";
export const RODEO_EXHIBIT_REV = "Rev 7-1-26";
export const FERNDALE_EXHIBIT_REV = "Rev 6-1-26";
export const EAST_COAST_COMP = "East Coast COMP Amendment 11 PCA0001103";
export const WEST_COAST_COMP = "West Coast COMP Amendment 8 PCA0001100";
export const MONROE_CONTRACT = "CW35353";
export const MONROE_EXHIBIT = "C-1 V2.15";
export const MONROE_EFFECTIVE = "2026-07-01";
export const YATES_WAGE_LABEL = "Yates Rate builder — Base Rate";
export const MONROE_WAGE_LABEL = "CW35353 Exhibit C-1 — Monroe Energy";

export type WageCoast = "east" | "west" | null;
export type WageKind = "comp-east" | "comp-west" | "c1" | "workbook" | null;

export type WageBook = {
  bookId: string;
  bookLabel: string;
  wageLabel?: string;
  plant: string;
  siteId: string;
  catalog: ShahanLaborRow[];
  wageCatalog: ShahanLaborRow[];
  staffPd: number;
  craftPd: number;
  markup: number | null;
  wageCoast: WageCoast;
  wageKind: WageKind;
  pca: string | null;
  amendment: number | null;
  effective: string | null;
  exhibitRev: string | null;
};

export const WAGE_BOOKS: WageBook[] = [
  {
    bookId: YATES_BOOK_ID,
    bookLabel: YATES_BOOK_LABEL,
    plant: YATES_PLANT,
    siteId: YATES_SITE_ID,
    catalog: YATES_LABOR,
    wageCatalog: YATES_WAGE,
    wageLabel: YATES_WAGE_LABEL,
    staffPd: YATES_STAFF_PD,
    craftPd: YATES_CRAFT_PD,
    markup: YATES_MARKUP,
    wageCoast: null,
    wageKind: "workbook",
    pca: null,
    amendment: null,
    effective: null,
    exhibitRev: null,
  },
  {
    bookId: RODEO_BOOK_ID,
    bookLabel: RODEO_BOOK_LABEL,
    plant: RODEO_PLANT,
    siteId: RODEO_SITE_ID,
    catalog: RODEO_LABOR,
    wageCatalog: RODEO_LABOR.filter((row) => row.wageSource === "comp"),
    wageLabel: "Rodeo COMP West B-1 (Amendment 8) · samples",
    staffPd: RODEO_STAFF_PD,
    craftPd: RODEO_CRAFT_PD,
    markup: RODEO_MARKUP,
    wageCoast: "west",
    wageKind: "comp-west",
    pca: WEST_COAST_PCA,
    amendment: WEST_COAST_AMENDMENT,
    effective: COMP_EFFECTIVE,
    exhibitRev: RODEO_EXHIBIT_REV,
  },
  {
    bookId: BAYWAY_BOOK_ID,
    bookLabel: BAYWAY_BOOK_LABEL,
    plant: BAYWAY_PLANT,
    siteId: BAYWAY_SITE_ID,
    catalog: BAYWAY_LABOR,
    wageCatalog: BAYWAY_WAGE,
    staffPd: BAYWAY_STAFF_PD,
    craftPd: BAYWAY_CRAFT_PD,
    markup: BAYWAY_MARKUP,
    wageCoast: "east",
    wageKind: "comp-east",
    pca: EAST_COAST_PCA,
    amendment: EAST_COAST_AMENDMENT,
    effective: COMP_EFFECTIVE,
    exhibitRev: null,
  },
  {
    bookId: FERNDALE_BOOK_ID,
    bookLabel: FERNDALE_BOOK_LABEL,
    plant: FERNDALE_PLANT,
    siteId: FERNDALE_SITE_ID,
    catalog: FERNDALE_LABOR,
    wageCatalog: FERNDALE_LABOR,
    wageLabel: "Ferndale COMP West B-1 (Amendment 8) · samples",
    staffPd: FERNDALE_STAFF_PD,
    craftPd: FERNDALE_CRAFT_PD,
    markup: FERNDALE_MARKUP,
    wageCoast: "west",
    wageKind: "comp-west",
    pca: WEST_COAST_PCA,
    amendment: WEST_COAST_AMENDMENT,
    effective: COMP_EFFECTIVE,
    exhibitRev: FERNDALE_EXHIBIT_REV,
  },
  {
    bookId: SHAHAN_BOOK_ID,
    bookLabel: SHAHAN_BOOK_LABEL,
    plant: SHAHAN_PLANT,
    siteId: WOOD_RIVER_SITE_ID,
    catalog: SHAHAN_LABOR,
    wageCatalog: WOOD_RIVER_WAGE,
    staffPd: SHAHAN_STAFF_PD,
    craftPd: SHAHAN_CRAFT_PD,
    markup: null,
    wageCoast: "east",
    wageKind: "comp-east",
    pca: EAST_COAST_PCA,
    amendment: EAST_COAST_AMENDMENT,
    effective: COMP_EFFECTIVE,
    exhibitRev: null,
  },
  {
    bookId: MONROE_BOOK_ID,
    bookLabel: MONROE_BOOK_LABEL,
    wageLabel: MONROE_WAGE_LABEL,
    plant: MONROE_PLANT,
    siteId: MONROE_SITE_ID,
    catalog: MONROE_LABOR,
    wageCatalog: MONROE_WAGE,
    staffPd: MONROE_STAFF_PD,
    craftPd: MONROE_CRAFT_PD,
    markup: MONROE_MARKUP,
    wageCoast: null,
    wageKind: "c1",
    pca: MONROE_CONTRACT,
    amendment: null,
    effective: MONROE_EFFECTIVE,
    exhibitRev: MONROE_EXHIBIT,
  },
];

function hay(site = "") {
  return site.trim().toLowerCase();
}

export function bookForSiteId(siteId = ""): WageBook | null {
  const id = siteId.trim();
  if (!id) return null;
  return WAGE_BOOKS.find((book) => book.siteId === id) ?? null;
}

export function bookForSite(site = ""): WageBook | null {
  const key = hay(site);
  if (!key) return null;
  const byId = bookForSiteId(key);
  if (byId) return byId;
  if (/wood\s*river/.test(key)) return bookForSiteId(WOOD_RIVER_SITE_ID);
  if (/\byates\b/.test(key)) return bookForSiteId(YATES_SITE_ID);
  if (/\brodeo\b/.test(key)) return bookForSiteId(RODEO_SITE_ID);
  if (/\bbayway\b/.test(key)) return bookForSiteId(BAYWAY_SITE_ID);
  if (/ferndale/.test(key)) return bookForSiteId(FERNDALE_SITE_ID);
  if (/monroe/.test(key)) return bookForSiteId(MONROE_SITE_ID);
  if (/billings/.test(key)) return null;
  return null;
}

export function siteIdForJobSite(site = ""): string | null {
  return bookForSite(site)?.siteId ?? null;
}

export function catalogForSite(site = ""): ShahanLaborRow[] | undefined {
  const book = bookForSite(site);
  if (book) return book.catalog;
  if (!site.trim()) return undefined;
  return [];
}

export function wageLookupOpts(site = "", extra: ShahanLookupOpts = {}): ShahanLookupOpts {
  if (extra.catalog) return extra;
  const catalog = catalogForSite(site);
  if (catalog) return { ...extra, catalog };
  return extra;
}

export function offerRateBookForSite(site = ""):
  | { ok: true; bookId: string; bookLabel: string; book: WageBook }
  | { ok: false; message: string } {
  const book = bookForSite(site);
  if (!book) return { ok: false, message: SHAHAN_NO_BOOK_MESSAGE };
  return { ok: true, bookId: book.bookId, bookLabel: book.bookLabel, book };
}

export function applyPlantJobRates<T extends JobRates>(rates: T, book: WageBook): T {
  return {
    ...rates,
    staffPerDiemRate: book.staffPd,
    craftPerDiemRate: book.craftPd,
    rateBook: book.bookId,
  };
}

export type WageLookupLabel = {
  row: ShahanLaborRow;
  label: string;
  index: number;
};

/** Wage lookup sections use the unique book's own group labels. */
export function wageCatalogByGroup(catalog: ShahanLaborRow[]): { group: string; rows: ShahanLaborRow[] }[] {
  const grouped = new Map<string, ShahanLaborRow[]>();
  for (const row of catalog) {
    const key = row.group || "OTHER";
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([group, rows]) => ({ group, rows }));
}

/** Keep duplicate titles. Append group when present; else craft order. */
export function wageLookupLabels(catalog: ShahanLaborRow[]): WageLookupLabel[] {
  const titleCounts = new Map<string, number>();
  for (const row of catalog) {
    titleCounts.set(row.craftName, (titleCounts.get(row.craftName) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return catalog.map((row, index) => {
    const count = titleCounts.get(row.craftName) ?? 1;
    if (count <= 1) return { row, label: row.craftName, index };
    if (row.group) return { row, label: `${row.craftName} (${row.group})`, index };
    const n = (seen.get(row.craftName) ?? 0) + 1;
    seen.set(row.craftName, n);
    return { row, label: `${row.craftName} (${n})`, index };
  });
}

export function formatBaseWage(row: ShahanLaborRow, book: WageBook): string {
  if (typeof row.baseSt === "number" && Number.isFinite(row.baseSt) && row.baseSt > 0) {
    return formatDeskDollars(row.baseSt);
  }
  if (book.wageKind === "comp-east" || book.wageKind === "comp-west" || book.wageKind === "c1") return "";
  return NO_COMP_WAGE_MESSAGE;
}

export function formatBilledSt(row: ShahanLaborRow): string {
  if (typeof row.st === "number" && Number.isFinite(row.st) && row.st > 0) {
    return formatDeskDollars(row.st);
  }
  return "—";
}

export function wageLookupNote(book: WageBook): string {
  if (book.wageKind === "comp-east") {
    return `${EAST_COAST_COMP}, effective ${COMP_EFFECTIVE}. Base wage is Exhibit B-1 BW on the ST row. Billed ST is the composite — not the wage.`;
  }
  if (book.wageKind === "comp-west") {
    const exhibit = book.exhibitRev ? ` ${book.plant} (${book.exhibitRev})` : "";
    return `${WEST_COAST_COMP}, effective ${COMP_EFFECTIVE}. Replaces Exhibit B-1 for${exhibit} only. Unique night-sheet rows are still extracting. Base wage is Exhibit B-1 BW on the ST row. Billed ST is the composite — not the wage.`;
  }
  if (book.wageKind === "c1") {
    return `Monroe Energy ${MONROE_CONTRACT} Exhibit ${MONROE_EXHIBIT}, Trainer, effective ${MONROE_EFFECTIVE}. Base wage is C-1 BW. Billed ST is the composite — not the wage.`;
  }
  if (book.wageKind === "workbook") {
    return "Yates Labor Ratebuilder Base Rate. Not COMP and not Shahan billed ST. Billed ST is the sheet ST Billable.";
  }
  return "No COMP PDF for this plant yet. Base wage is Shahan Base ST where sheeted, otherwise No COMP book yet. Billed ST is not the wage.";
}

export function isWoodRiverBook(book: Pick<WageBook, "siteId" | "bookId">): boolean {
  return book.siteId === WOOD_RIVER_SITE_ID || book.bookId === SHAHAN_BOOK_ID;
}
