/**
 * Read-only wage lookup for an estimate's Job setup site.
 * Wood River uses the live Shahan TM OCIP catalog. Other sites use a saved
 * builder book when one exists. Do not invent dollars.
 */

import { inferCompanyIdFromParts, type CompanyId } from "./companies.ts";
import { catalogSites } from "./desk-data.ts";
import { matchCatalogSite } from "./job-tree.ts";
import { siteIdFromSite, type StorageLike } from "./local-estimates.ts";
import { compositeRates } from "./rate-builder.ts";
import {
  WOOD_RIVER_SITE_ID,
  hasSiteBook,
  resolvedCrafts,
  siteBookFor,
  siteCompanyId,
} from "./rate-books.ts";
import {
  SHAHAN_BOOK_LABEL,
  SHAHAN_LABOR,
  formatDeskDollars,
  type ShahanLaborRow,
} from "./shahan-wood-river.ts";

export const WAGE_LOOKUP_EMPTY = "No book yet";

export type WageLookupPosition = {
  id: string;
  title: string;
  group?: string;
  st: number | null;
  ot: number | null;
  dt: number | null;
};

export type WageLookupBook = {
  companyId: CompanyId;
  siteId: string;
  siteName: string;
  label: string;
  source: "shahan" | "builder";
  positions: WageLookupPosition[];
};

export function estimateRateContext(
  site = "",
  client = "",
): { companyId: CompanyId; siteId: string; siteName: string } {
  const matched = matchCatalogSite([site, client].filter(Boolean).join(" "));
  const siteId = matched?.id || siteIdFromSite(site, client);
  const catalog = catalogSites().find((row) => row.id === siteId);
  const companyId = catalog ? siteCompanyId(catalog) : inferCompanyIdFromParts(client, site);
  return {
    companyId,
    siteId,
    siteName: catalog?.name || site || "Site",
  };
}

function titleCounts(rows: Array<{ title: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.title, (counts.get(row.title) || 0) + 1);
  return counts;
}

function shahanPositions(catalog: ShahanLaborRow[] = SHAHAN_LABOR): WageLookupPosition[] {
  const drafted = catalog.map((row, index) => ({
    id: `shahan:${index}:${row.craftName}`,
    title: row.craftName,
    group: row.group,
    st: row.st,
    ot: row.ot,
    dt: row.dt,
  }));
  const counts = titleCounts(drafted);
  return drafted.map((row) =>
    (counts.get(row.title) || 0) > 1 && row.group
      ? { ...row, title: `${row.title} · ${row.group}` }
      : row,
  );
}

function builderPositions(
  companyId: CompanyId,
  siteId: string,
  store?: StorageLike | null,
): WageLookupPosition[] {
  return resolvedCrafts(companyId, siteId, undefined, store)
    .filter((craft) => craft.craft.trim())
    .map((craft) => {
      const rates = compositeRates(craft);
      return {
        id: craft.id,
        title: craft.craft,
        st: rates.st,
        ot: rates.ot,
        dt: rates.dt,
      };
    });
}

export function wageLookupBook(
  site = "",
  client = "",
  store?: StorageLike | null,
): WageLookupBook | null {
  const ctx = estimateRateContext(site, client);
  const book = siteBookFor(ctx.companyId, ctx.siteId, store);
  const woodRiver = ctx.companyId === "madison" && ctx.siteId === WOOD_RIVER_SITE_ID;
  if (woodRiver || book?.source === "shahan") {
    return {
      ...ctx,
      label: book?.label || SHAHAN_BOOK_LABEL,
      source: "shahan",
      positions: shahanPositions(),
    };
  }
  if (!book || !hasSiteBook(ctx.companyId, ctx.siteId, store)) return null;
  const positions = builderPositions(ctx.companyId, ctx.siteId, store);
  if (!positions.length) return null;
  return {
    ...ctx,
    label: book.label,
    source: "builder",
    positions,
  };
}

export function wageLookupPositions(site = "", client = "", store?: StorageLike | null) {
  return wageLookupBook(site, client, store)?.positions ?? [];
}

export function lookupWageRate(
  site = "",
  client = "",
  positionId = "",
  store?: StorageLike | null,
): WageLookupPosition | null {
  if (!positionId) return null;
  return wageLookupPositions(site, client, store).find((row) => row.id === positionId) ?? null;
}

export function formatWageRate(row: Pick<WageLookupPosition, "st" | "ot" | "dt">) {
  const cell = (value: number | null) => (value && value > 0 ? formatDeskDollars(value) : "—");
  return `ST ${cell(row.st)} · OT ${cell(row.ot)} · DT ${cell(row.dt)}`;
}
