import {
  canSeeCompany,
  companiesForScope,
  inferCompanyIdFromParts,
  type Company,
  type CompanyId,
  type CompanyScope,
} from "./companies.ts";
import { catalogEstimates, catalogSites } from "./desk-data.ts";
import type { LocalPack, StorageLike } from "./local-estimates.ts";
import { newBuiltCraft, type BuiltCraft } from "./rate-builder.ts";
import { SHAHAN_BOOK_ID, SHAHAN_BOOK_LABEL } from "./shahan-wood-river.ts";
import type { JobRecord, SiteRecord } from "./types.ts";

export const RATE_BOOKS_KEY = "hs_rate_books_v1";
export const RATE_COMPANY_OPEN_KEY = "hs_rate_company_open_v1";
export const WOOD_RIVER_SITE_ID = "site-madison";
export const YATES_SITE_ID = "site-yates";
export const MONROE_SITE_ID = "site-monroe";
export const MADISON_RATE_PLANTS = ["Yates", "Rodeo", "Bayway", "Ferndale", "Wood River", "Billings", "Monroe Energy"] as const;
export const EMPTY_MADISON_PLANTS = ["Yates", "Rodeo", "Bayway", "Ferndale", "Billings", "Monroe Energy"] as const;

export type RateBookLevel = "company" | "site" | "job";

export type RateBookRecord = {
  id: string;
  companyId: CompanyId;
  siteId?: string;
  jobId?: string;
  jobTitle?: string;
  label: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  crafts: BuiltCraft[];
  archived?: boolean;
  source: "shahan" | "builder";
};

function asStore(store?: StorageLike | null): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function woodRiverBook(): RateBookRecord {
  return {
    id: SHAHAN_BOOK_ID,
    companyId: "madison",
    siteId: WOOD_RIVER_SITE_ID,
    label: SHAHAN_BOOK_LABEL,
    source: "shahan",
    crafts: [],
  };
}

export function seededRateBooks(): RateBookRecord[] {
  return [woodRiverBook()];
}

export function siteCompanyId(site: Pick<SiteRecord, "client" | "name" | "family" | "city">): CompanyId {
  return inferCompanyIdFromParts(site.client, site.name, site.family, site.city);
}

export function rateSitesForCompany(companyId: CompanyId, sites: SiteRecord[] = catalogSites()): SiteRecord[] {
  return sites.filter((site) => siteCompanyId(site) === companyId);
}

/** Rates lists the company plant catalog. Jobs assignment does not hide plants here. */
export function visibleRateSites(
  scope: CompanyScope | null | undefined,
  companyId: CompanyId,
  _jobs: JobRecord[] = [],
  _packs: LocalPack[] = [],
  sites: SiteRecord[] = catalogSites(),
): SiteRecord[] {
  if (scope && !scope.isOwner && !canSeeCompany(scope, companyId)) return [];
  return rateSitesForCompany(companyId, sites);
}

export function rateCompanyOpenKey(seat?: string | null) {
  const id = (seat || "").trim();
  if (!id || id === "owner") return RATE_COMPANY_OPEN_KEY;
  return `${RATE_COMPANY_OPEN_KEY}:${id}`;
}

export function readRateCompanyOpen(store?: StorageLike | null, seat?: string | null): Record<string, boolean> {
  const target = asStore(store);
  if (!target) return {};
  try {
    const parsed = JSON.parse(target.getItem(rateCompanyOpenKey(seat)) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, boolean> = {};
    for (const [id, open] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof open === "boolean") next[id] = open;
    }
    return next;
  } catch {
    return {};
  }
}

export function writeRateCompanyOpen(
  companyId: CompanyId,
  open: boolean,
  store?: StorageLike | null,
  seat?: string | null,
) {
  const target = asStore(store);
  const next = { ...readRateCompanyOpen(store, seat), [companyId]: open };
  if (target) target.setItem(rateCompanyOpenKey(seat), JSON.stringify(next));
  return next;
}

/** Default expanded. Remembered per company for that seat. */
export function isRateCompanyOpen(companyId: CompanyId, store?: StorageLike | null, seat?: string | null) {
  const saved = readRateCompanyOpen(store, seat)[companyId];
  return saved !== false;
}

export function rateBookVisibleTo(scope: CompanyScope | null | undefined, book: Pick<RateBookRecord, "companyId">) {
  return canSeeCompany(scope, book.companyId);
}

export function visibleRateBooks(scope: CompanyScope | null | undefined, books: RateBookRecord[]) {
  return books.filter((book) => !book.archived && rateBookVisibleTo(scope, book));
}

export function companiesWithRateChrome(scope: CompanyScope | null | undefined, catalog?: Company[]) {
  return companiesForScope(scope, catalog);
}

export function parseRateBook(row: unknown): RateBookRecord | null {
  if (!row || typeof row !== "object") return null;
  const next = row as Partial<RateBookRecord>;
  if (typeof next.id !== "string" || !next.id.trim()) return null;
  if (typeof next.companyId !== "string" || !next.companyId.trim()) return null;
  if (next.source === "shahan") return null;
  return {
    id: next.id.trim(),
    companyId: next.companyId.trim(),
    siteId: typeof next.siteId === "string" ? next.siteId : undefined,
    jobId: typeof next.jobId === "string" ? next.jobId : undefined,
    jobTitle: typeof next.jobTitle === "string" ? next.jobTitle : undefined,
    label: typeof next.label === "string" && next.label.trim() ? next.label.trim() : "Working book",
    effectiveFrom: typeof next.effectiveFrom === "string" ? next.effectiveFrom : undefined,
    effectiveTo: typeof next.effectiveTo === "string" ? next.effectiveTo : undefined,
    crafts: Array.isArray(next.crafts) ? next.crafts.map((craft) => newBuiltCraft(craft)) : [],
    archived: Boolean(next.archived),
    source: "builder",
  };
}

export function readStoredRateBooks(store?: StorageLike | null): RateBookRecord[] {
  const target = asStore(store);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(RATE_BOOKS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseRateBook).filter((row): row is RateBookRecord => Boolean(row));
  } catch {
    return [];
  }
}

export function writeStoredRateBooks(books: RateBookRecord[], store?: StorageLike | null) {
  const target = asStore(store);
  if (!target) return books;
  target.setItem(RATE_BOOKS_KEY, JSON.stringify(books.filter((book) => book.source !== "shahan")));
  return books;
}

export function allRateBooks(store?: StorageLike | null): RateBookRecord[] {
  const stored = readStoredRateBooks(store);
  const seeded = seededRateBooks().filter((seed) => !stored.some((row) => row.id === seed.id));
  return [...seeded, ...stored];
}

export function bookLevel(book: Pick<RateBookRecord, "siteId" | "jobId">): RateBookLevel {
  if (book.jobId) return "job";
  if (book.siteId) return "site";
  return "company";
}

export function activeBooksFor(
  companyId: CompanyId,
  siteId?: string,
  jobId?: string,
  store?: StorageLike | null,
): RateBookRecord[] {
  return allRateBooks(store).filter((book) => {
    if (book.archived) return false;
    if (book.companyId !== companyId) return false;
    if (jobId && book.jobId === jobId) return true;
    if (siteId && book.siteId === siteId && !book.jobId) return true;
    if (!book.siteId && !book.jobId) return true;
    return false;
  });
}

export function siteBookFor(companyId: CompanyId, siteId: string, store?: StorageLike | null): RateBookRecord | null {
  const books = allRateBooks(store).filter(
    (book) => !book.archived && book.companyId === companyId && book.siteId === siteId && !book.jobId,
  );
  return books.find((book) => book.source === "builder") || books.find((book) => book.source === "shahan") || books[0] || null;
}

export function hasSiteBook(companyId: CompanyId, siteId: string, store?: StorageLike | null) {
  return Boolean(siteBookFor(companyId, siteId, store));
}

/** Wage lookup lands on a site that actually has a book. First catalog row is often empty. */
export function preferredRateSiteId(
  companyId: CompanyId,
  sites: Array<{ id: string }>,
  store?: StorageLike | null,
) {
  const withBook = sites.find((site) => hasSiteBook(companyId, site.id, store));
  if (withBook) return withBook.id;
  if (companyId === "madison") return WOOD_RIVER_SITE_ID;
  return sites[0]?.id || "";
}

export function mergeCrafts(...lists: Array<BuiltCraft[] | undefined>): BuiltCraft[] {
  const map = new Map<string, BuiltCraft>();
  for (const list of lists) {
    for (const craft of list ?? []) {
      const key = craft.craft.trim().toLowerCase() || craft.id;
      map.set(key, craft);
    }
  }
  return [...map.values()];
}

export function resolvedCrafts(
  companyId: CompanyId,
  siteId?: string,
  jobId?: string,
  store?: StorageLike | null,
): BuiltCraft[] {
  const books = activeBooksFor(companyId, siteId, jobId, store);
  const craftsFor = (level: RateBookLevel) =>
    mergeCrafts(...books.filter((book) => bookLevel(book) === level).map((book) => book.crafts));
  return mergeCrafts(craftsFor("company"), craftsFor("site"), craftsFor("job"));
}

export function jobOverrides(
  companyId: CompanyId,
  siteId: string,
  store?: StorageLike | null,
): RateBookRecord[] {
  return allRateBooks(store).filter(
    (book) =>
      !book.archived &&
      book.companyId === companyId &&
      book.siteId === siteId &&
      Boolean(book.jobId) &&
      book.source === "builder",
  );
}

function upsertBook(books: RateBookRecord[], next: RateBookRecord) {
  const index = books.findIndex((book) => book.id === next.id);
  if (index >= 0) {
    const copy = [...books];
    copy[index] = next;
    return copy;
  }
  return [...books, next];
}

export function saveCraftToLevel(
  input: {
    companyId: CompanyId;
    siteId?: string;
    jobId?: string;
    jobTitle?: string;
    label?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    craft: BuiltCraft;
    level: RateBookLevel;
  },
  store?: StorageLike | null,
): RateBookRecord {
  const stored = readStoredRateBooks(store);
  const siteId = input.level === "company" ? undefined : input.siteId;
  const jobId = input.level === "job" ? input.jobId : undefined;
  const existing =
    stored.find((book) => {
      if (book.archived || book.companyId !== input.companyId) return false;
      if (input.level === "company") return !book.siteId && !book.jobId;
      if (input.level === "site") return book.siteId === siteId && !book.jobId;
      return book.jobId === jobId && book.siteId === siteId;
    }) ?? null;
  const craft = newBuiltCraft(input.craft);
  const crafts = mergeCrafts(existing?.crafts, [craft]);
  const next: RateBookRecord = {
    id: existing?.id || `book-${input.level}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: input.companyId,
    siteId,
    jobId,
    jobTitle: input.level === "job" ? input.jobTitle || existing?.jobTitle : undefined,
    label: input.label?.trim() || existing?.label || (input.level === "job" ? "Job override" : "Working book"),
    effectiveFrom: input.effectiveFrom ?? existing?.effectiveFrom,
    effectiveTo: input.effectiveTo ?? existing?.effectiveTo,
    crafts,
    source: "builder",
  };
  writeStoredRateBooks(upsertBook(stored, next), store);
  return next;
}

export function clearJobOverride(
  companyId: CompanyId,
  siteId: string,
  jobId: string,
  craftName?: string,
  store?: StorageLike | null,
): RateBookRecord | null {
  const stored = readStoredRateBooks(store);
  const index = stored.findIndex(
    (book) => book.companyId === companyId && book.siteId === siteId && book.jobId === jobId && !book.archived,
  );
  if (index < 0) return null;
  const current = stored[index];
  const crafts = craftName
    ? current.crafts.filter((row) => row.craft.trim().toLowerCase() !== craftName.trim().toLowerCase())
    : [];
  const next: RateBookRecord = crafts.length
    ? { ...current, crafts }
    : { ...current, crafts: [], archived: true };
  writeStoredRateBooks(upsertBook(stored, next), store);
  return next;
}

export function archiveRateBook(bookId: string, store?: StorageLike | null): RateBookRecord | null {
  if (bookId === SHAHAN_BOOK_ID) return woodRiverBook();
  const stored = readStoredRateBooks(store);
  const current = stored.find((book) => book.id === bookId);
  if (!current) return null;
  const next = { ...current, archived: true };
  writeStoredRateBooks(upsertBook(stored, next), store);
  return next;
}

export function canArchiveRateBook(book: Pick<RateBookRecord, "id" | "source">) {
  return book.source !== "shahan" && book.id !== SHAHAN_BOOK_ID;
}

export function jobsForRateSite(siteId: string): Array<{ id: string; title: string }> {
  return catalogEstimates()
    .filter((row) => row.siteId === siteId)
    .map((row) => ({ id: row.id, title: row.title }));
}
