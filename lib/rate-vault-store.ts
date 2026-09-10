/**
 * Owner-added Rate Vault catalog + confirmed reviews.
 * Metadata only in rate-vault.json — never persist uploaded binaries.
 */

import { dataFolderId, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { type DriveAdapter, vaultDriveAdapter } from "./drive-estimates.ts";
import {
  RATE_VAULT_LIBRARY_KIND,
  RATE_VAULT_LIBRARY_NAME,
  ownerLibraryEntry,
  parseOwnerLibraryInput,
} from "./rate-vault-library.ts";
import { isRateVaultSiteId, isRateVaultSourceKind, type RateVaultConfirmedReview, type RateVaultPreviewPackage, type RateVaultSourceEntry, type RateVaultSourceOverride } from "./rate-vault.ts";
import { cloneRateVaultPreview, parseRateVaultPreviewPackage } from "./rate-vault-preview.ts";

type StoreFile = {
  extras?: RateVaultSourceEntry[];
  reviews?: RateVaultConfirmedReview[];
  overrides?: RateVaultSourceOverride[];
  packages?: RateVaultPreviewPackage[];
};

let extras: RateVaultSourceEntry[] = [];
let reviews: RateVaultConfirmedReview[] = [];
let overrides: RateVaultSourceOverride[] = [];
let packages: RateVaultPreviewPackage[] = [];
let injectedAdapter: DriveAdapter | null | undefined;
let hydrated = false;

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  const drive = vaultDriveAdapter();
  return drive.configured ? drive : null;
}

function cloneEntries(rows: RateVaultSourceEntry[]) {
  return rows.map((row) => ({ ...row }));
}

function cloneReviews(rows: RateVaultConfirmedReview[]) {
  return rows.map((row) => ({ ...row, writesRateBook: false as const }));
}

function sanitizeEntry(row: RateVaultSourceEntry): RateVaultSourceEntry {
  const { ...safe } = row;
  delete (safe as { data?: unknown }).data;
  delete (safe as { bytes?: unknown }).bytes;
  delete (safe as { content?: unknown }).content;
  return {
    ...safe,
    href: safe.href,
    note: safe.note,
  };
}

function parseExtras(raw: unknown): RateVaultSourceEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RateVaultSourceEntry[] = [];
  for (const row of raw) {
    const parsed = parseOwnerLibraryInput(row);
    if ("error" in parsed) continue;
    const origin = row && typeof row === "object" && (row as { origin?: unknown }).origin === "seed" ? "seed" : "owner";
    out.push(
      sanitizeEntry(
        ownerLibraryEntry({
          ...parsed,
          primary: parsed.primary,
          archived: parsed.archived,
        }),
      ),
    );
    if (origin === "seed") out[out.length - 1].origin = "owner";
  }
  return out;
}

function parseReviews(raw: unknown): RateVaultConfirmedReview[] {
  if (!Array.isArray(raw)) return [];
  const out: RateVaultConfirmedReview[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as RateVaultConfirmedReview;
    if (typeof item.sourceId !== "string" || !item.sourceId.trim()) continue;
    if (typeof item.kind !== "string") continue;
    out.push({
      sourceId: item.sourceId,
      kind: item.kind,
      siteId: isRateVaultSiteId(item.siteId) ? item.siteId : null,
      craft: item.craft ?? null,
      local: item.local ?? null,
      confirmedAt: typeof item.confirmedAt === "string" ? item.confirmedAt : new Date().toISOString(),
      writesRateBook: false,
    });
  }
  return out;
}

async function persist() {
  const drive = resolveAdapter();
  if (!drive) return;
  await writeVaultJson(
    drive,
    RATE_VAULT_LIBRARY_NAME,
    RATE_VAULT_LIBRARY_KIND,
    {
      extras: extras.map(sanitizeEntry),
      reviews: cloneReviews(reviews),
      overrides: overrides.map((row) => ({ ...row })),
      packages: packages.map(sanitizePackage),
    },
    dataFolderId(),
  );
}

export function useRateVaultStoreForTests(drive: DriveAdapter | null) {
  injectedAdapter = drive;
  extras = [];
  reviews = [];
  overrides = [];
  packages = [];
  hydrated = false;
}

export function resetRateVaultStoreForTests() {
  injectedAdapter = undefined;
  extras = [];
  reviews = [];
  overrides = [];
  packages = [];
  hydrated = false;
}

export async function hydrateRateVaultStore() {
  if (hydrated && injectedAdapter === undefined) return;
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson<StoreFile>(drive, RATE_VAULT_LIBRARY_NAME, RATE_VAULT_LIBRARY_KIND, dataFolderId());
      extras = parseExtras(raw?.extras);
      reviews = parseReviews(raw?.reviews);
      overrides = parseOverrides(raw?.overrides);
      packages = parsePackages(raw?.packages);
    } catch {
      // keep memory
    }
  }
  hydrated = true;
}

export async function listRateVaultOwnerLibrary() {
  await hydrateRateVaultStore();
  return cloneEntries(extras);
}

export async function listRateVaultReviews() {
  await hydrateRateVaultStore();
  return cloneReviews(reviews);
}

function parseOverrides(raw: unknown): RateVaultSourceOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: RateVaultSourceOverride[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as RateVaultSourceOverride;
    if (typeof item.sourceId !== "string" || !item.sourceId.trim()) continue;
    out.push({
      sourceId: item.sourceId,
      siteId: item.siteId === null || isRateVaultSiteId(item.siteId) ? item.siteId : undefined,
      kind: isRateVaultSourceKind(item.kind) ? item.kind : undefined,
    });
  }
  return out;
}

export async function listRateVaultOverrides() {
  await hydrateRateVaultStore();
  return overrides.map((row) => ({ ...row }));
}

export async function organizeRateVaultSource(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ok: false as const, status: 400, error: "Pick a source to move." };
  const row = raw as { sourceId?: unknown; siteId?: unknown; kind?: unknown };
  const sourceId = typeof row.sourceId === "string" ? row.sourceId.trim() : "";
  if (!sourceId) return { ok: false as const, status: 400, error: "Pick a source to move." };
  await hydrateRateVaultStore();
  const kind = isRateVaultSourceKind(row.kind) ? row.kind : undefined;
  const siteId =
    row.siteId === "" || row.siteId === null
      ? null
      : isRateVaultSiteId(row.siteId)
        ? row.siteId
        : undefined;
  if (kind === undefined && siteId === undefined) {
    return { ok: false as const, status: 400, error: "Drop onto a site or kind bucket." };
  }
  const extra = extras.find((item) => item.id === sourceId || item.driveId === sourceId);
  if (extra) {
    extras = extras.map((item) =>
      item.id === extra.id
        ? { ...item, ...(kind ? { kind } : {}), ...(siteId !== undefined ? { siteId } : {}) }
        : item,
    );
  }
  const next: RateVaultSourceOverride = {
    sourceId,
    ...(kind ? { kind } : {}),
    ...(siteId !== undefined ? { siteId } : {}),
  };
  const index = overrides.findIndex((item) => item.sourceId === sourceId);
  if (index >= 0) overrides[index] = { ...overrides[index], ...next };
  else overrides.push(next);
  await persist();
  return { ok: true as const, override: next };
}

export async function addRateVaultOwnerSource(raw: unknown) {
  const parsed = parseOwnerLibraryInput(raw);
  if ("error" in parsed) return { ok: false as const, status: 400, error: parsed.error };
  await hydrateRateVaultStore();
  const entry = sanitizeEntry(ownerLibraryEntry(parsed));
  const index = extras.findIndex((row) => row.id === entry.id || row.driveId === entry.driveId);
  if (index >= 0) extras[index] = entry;
  else extras.push(entry);
  await persist();
  return { ok: true as const, entry };
}

export async function confirmRateVaultReview(review: RateVaultConfirmedReview) {
  await hydrateRateVaultStore();
  const next: RateVaultConfirmedReview = { ...review, writesRateBook: false };
  const index = reviews.findIndex((row) => row.sourceId === next.sourceId);
  if (index >= 0) reviews[index] = next;
  else reviews.push(next);
  await persist();
  return next;
}

function sanitizePackage(row: RateVaultPreviewPackage): RateVaultPreviewPackage {
  const cloned = cloneRateVaultPreview(row);
  delete (cloned as { data?: unknown }).data;
  delete (cloned as { bytes?: unknown }).bytes;
  delete (cloned as { content?: unknown }).content;
  return { ...cloned, writesRateBook: false };
}

function parsePackages(raw: unknown): RateVaultPreviewPackage[] {
  if (!Array.isArray(raw)) return [];
  const out: RateVaultPreviewPackage[] = [];
  for (const row of raw) {
    const parsed = parseRateVaultPreviewPackage(row);
    if ("error" in parsed) continue;
    const fixture = Boolean(row && typeof row === "object" && (row as { fixture?: unknown }).fixture === true);
    const extractedFrom =
      row && typeof row === "object" && typeof (row as { extractedFrom?: unknown }).extractedFrom === "string"
        ? (row as { extractedFrom: string }).extractedFrom
        : parsed.extractedFrom;
    out.push(
      sanitizePackage({
        ...parsed,
        fixture,
        extractedFrom,
        writesRateBook: false,
      }),
    );
  }
  return out;
}

export async function listRateVaultPackages() {
  await hydrateRateVaultStore();
  return packages.map(cloneRateVaultPreview);
}

export async function getRateVaultPackage(siteId: string | null | undefined) {
  await hydrateRateVaultStore();
  const match = packages.find((row) => row.siteId === siteId);
  return match ? cloneRateVaultPreview(match) : null;
}

export async function upsertRateVaultPackage(raw: RateVaultPreviewPackage) {
  await hydrateRateVaultStore();
  const parsed = parseRateVaultPreviewPackage({
    ...raw,
    fixture: raw.fixture,
    extractedFrom: raw.extractedFrom,
  });
  if ("error" in parsed) return { ok: false as const, status: 400, error: parsed.error };
  const preview = sanitizePackage({
    ...parsed,
    fixture: raw.fixture === true,
    extractedFrom: raw.extractedFrom || parsed.extractedFrom,
    writesRateBook: false,
  });
  packages = [...packages.filter((row) => row.siteId !== preview.siteId), preview];
  await persist();
  return { ok: true as const, preview: cloneRateVaultPreview(preview) };
}

export function storePayloadLeaksBinary(payload: unknown) {
  return /"data"\s*:|"bytes"\s*:|"content"\s*:/.test(JSON.stringify(payload ?? ""));
}
