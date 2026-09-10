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
import type { RateVaultConfirmedReview, RateVaultSourceEntry } from "./rate-vault.ts";

type StoreFile = {
  extras?: RateVaultSourceEntry[];
  reviews?: RateVaultConfirmedReview[];
};

let extras: RateVaultSourceEntry[] = [];
let reviews: RateVaultConfirmedReview[] = [];
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
      siteId: item.siteId ?? null,
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
    { extras: extras.map(sanitizeEntry), reviews: cloneReviews(reviews) },
    dataFolderId(),
  );
}

export function useRateVaultStoreForTests(drive: DriveAdapter | null) {
  injectedAdapter = drive;
  extras = [];
  reviews = [];
  hydrated = false;
}

export function resetRateVaultStoreForTests() {
  injectedAdapter = undefined;
  extras = [];
  reviews = [];
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

export function storePayloadLeaksBinary(payload: unknown) {
  return /"data"\s*:|"bytes"\s*:|"content"\s*:/.test(JSON.stringify(payload ?? ""));
}
