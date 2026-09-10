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
import {
  RATE_VAULT_BUYOFF_STATUSES,
  buyoffStatusForAction,
  isRateVaultBuyoffAction,
  isRateVaultSiteId,
  isRateVaultSourceKind,
  type RateVaultBuyoffAction,
  type RateVaultBuyoffDecision,
  type RateVaultConfirmedReview,
  type RateVaultPackageVersion,
  type RateVaultPreviewPackage,
  type RateVaultSourceEntry,
  type RateVaultSourceOverride,
} from "./rate-vault.ts";
import { cloneRateVaultPreview, loadWoodRiverB1PreviewFixture, parseRateVaultPreviewPackage, stampRateVaultVersion } from "./rate-vault-preview.ts";

type PackageStamp = RateVaultPackageVersion & { siteId: string };
type LastGoodRow = { siteId: string; preview: RateVaultPreviewPackage };

type StoreFile = {
  extras?: RateVaultSourceEntry[];
  reviews?: RateVaultConfirmedReview[];
  overrides?: RateVaultSourceOverride[];
  packages?: RateVaultPreviewPackage[];
  lastGood?: LastGoodRow[];
  versions?: PackageStamp[];
  buyoffs?: RateVaultBuyoffDecision[];
};

let extras: RateVaultSourceEntry[] = [];
let reviews: RateVaultConfirmedReview[] = [];
let overrides: RateVaultSourceOverride[] = [];
let packages: RateVaultPreviewPackage[] = [];
let lastGood: LastGoodRow[] = [];
let versions: PackageStamp[] = [];
let buyoffs: RateVaultBuyoffDecision[] = [];
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
      lastGood: lastGood.map((row) => ({ siteId: row.siteId, preview: sanitizePackage(row.preview) })),
      versions: versions.map((row) => ({ ...row })),
      buyoffs: buyoffs.map(sanitizeBuyoff),
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
  lastGood = [];
  versions = [];
  buyoffs = [];
  hydrated = false;
}

export function resetRateVaultStoreForTests() {
  injectedAdapter = undefined;
  extras = [];
  reviews = [];
  overrides = [];
  packages = [];
  lastGood = [];
  versions = [];
  buyoffs = [];
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
      lastGood = parseLastGood(raw?.lastGood);
      versions = parseVersions(raw?.versions);
      buyoffs = parseBuyoffs(raw?.buyoffs);
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

function parseLastGood(raw: unknown): LastGoodRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LastGoodRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as LastGoodRow;
    if (!isRateVaultSiteId(item.siteId) || !item.preview) continue;
    const preview = parseRateVaultPreviewPackage(item.preview);
    if ("error" in preview) continue;
    out.push({ siteId: item.siteId, preview: sanitizePackage(preview) });
  }
  return out;
}

function parseVersions(raw: unknown): PackageStamp[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as PackageStamp;
    if (!isRateVaultSiteId(item.siteId) || typeof item.id !== "string" || typeof item.at !== "string") return [];
    return [{ siteId: item.siteId, id: item.id, at: item.at, note: typeof item.note === "string" ? item.note : "Imported B-1 Excel" }];
  });
}

export async function upsertRateVaultPackage(raw: RateVaultPreviewPackage, note = "Imported B-1 Excel") {
  await hydrateRateVaultStore();
  const parsed = parseRateVaultPreviewPackage({
    ...raw,
    fixture: raw.fixture,
    extractedFrom: raw.extractedFrom,
  });
  if ("error" in parsed) return { ok: false as const, status: 400, error: parsed.error };
  const previous =
    packages.find((row) => row.siteId === parsed.siteId) ??
    (parsed.siteId === "wood-river" ? loadWoodRiverB1PreviewFixture() : null);
  const stamped = stampRateVaultVersion(
    {
      ...parsed,
      fixture: raw.fixture === true,
      extractedFrom: raw.extractedFrom || parsed.extractedFrom,
      writesRateBook: false,
    },
    raw.version?.note || note,
  );
  const preview = sanitizePackage(stamped);
  if (previous) {
    lastGood = [...lastGood.filter((row) => row.siteId !== preview.siteId), { siteId: preview.siteId, preview: cloneRateVaultPreview(previous) }];
    versions = [
      { siteId: preview.siteId, ...(preview.version || { id: `v-${Date.now()}`, at: new Date().toISOString(), note }) },
      ...versions.filter((row) => row.siteId === preview.siteId).slice(0, 7),
      ...versions.filter((row) => row.siteId !== preview.siteId),
    ];
  }
  packages = [...packages.filter((row) => row.siteId !== preview.siteId), preview];
  await persist();
  return { ok: true as const, preview: cloneRateVaultPreview(preview) };
}

export async function listRateVaultVersions(siteId: string) {
  await hydrateRateVaultStore();
  return versions.filter((row) => row.siteId === siteId).map((row) => ({ ...row }));
}

export async function restoreRateVaultLastGood(siteId: string) {
  await hydrateRateVaultStore();
  const saved = lastGood.find((row) => row.siteId === siteId);
  if (!saved) return { ok: false as const, status: 404, error: "No last-good package to restore." };
  const current = packages.find((row) => row.siteId === siteId) ?? null;
  if (current) {
    lastGood = [...lastGood.filter((row) => row.siteId !== siteId), { siteId, preview: cloneRateVaultPreview(current) }];
  }
  const preview = stampRateVaultVersion(saved.preview, "Restored last-good package");
  packages = [...packages.filter((row) => row.siteId !== siteId), sanitizePackage(preview)];
  versions = [
    { siteId, ...(preview.version || { id: `v-restore`, at: new Date().toISOString(), note: "Restored last-good package" }) },
    ...versions.filter((row) => row.siteId === siteId).slice(0, 7),
    ...versions.filter((row) => row.siteId !== siteId),
  ];
  await persist();
  return { ok: true as const, preview: cloneRateVaultPreview(preview) };
}

function sanitizeBuyoff(row: RateVaultBuyoffDecision): RateVaultBuyoffDecision {
  return {
    id: row.id,
    siteId: row.siteId,
    packageId: row.packageId,
    title: row.title,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    writesRateBook: false,
  };
}

function parseBuyoffs(raw: unknown): RateVaultBuyoffDecision[] {
  if (!Array.isArray(raw)) return [];
  const out: RateVaultBuyoffDecision[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as RateVaultBuyoffDecision;
    if (typeof item.id !== "string" || !item.id.trim()) continue;
    if (!isRateVaultSiteId(item.siteId)) continue;
    const status = (RATE_VAULT_BUYOFF_STATUSES as readonly string[]).includes(item.status)
      ? item.status
      : "pending";
    out.push(
      sanitizeBuyoff({
        id: item.id,
        siteId: item.siteId,
        packageId: typeof item.packageId === "string" ? item.packageId : item.id,
        title: typeof item.title === "string" ? item.title : "Rate package",
        status,
        note: typeof item.note === "string" ? item.note : "",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        decidedAt: typeof item.decidedAt === "string" ? item.decidedAt : null,
        decidedBy: typeof item.decidedBy === "string" ? item.decidedBy : null,
        writesRateBook: false,
      }),
    );
  }
  return out;
}

export async function listRateVaultBuyoffs() {
  await hydrateRateVaultStore();
  return buyoffs.map(sanitizeBuyoff);
}

export async function queueRateVaultBuyoff(preview: RateVaultPreviewPackage, note = "Imported B-1 Excel") {
  await hydrateRateVaultStore();
  const row: RateVaultBuyoffDecision = {
    id: `buyoff-${preview.siteId}-${Date.now()}`,
    siteId: preview.siteId,
    packageId: preview.id,
    title: preview.title,
    status: "pending",
    note: note.trim() || preview.version?.note || "Imported B-1 Excel",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
    writesRateBook: false,
  };
  buyoffs = [row, ...buyoffs.filter((item) => item.siteId !== preview.siteId || item.status !== "pending")].slice(0, 40);
  await persist();
  return sanitizeBuyoff(row);
}

export async function decideRateVaultBuyoff(input: {
  id?: string;
  action?: unknown;
  note?: string;
  decidedBy?: string;
}) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return { ok: false as const, status: 400, error: "Pick a rate package to decide." };
  if (!isRateVaultBuyoffAction(input.action)) {
    return { ok: false as const, status: 400, error: "Approve, reject, or request changes." };
  }
  await hydrateRateVaultStore();
  const current = buyoffs.find((row) => row.id === id);
  if (!current) return { ok: false as const, status: 404, error: "That buyoff is gone." };
  const next = sanitizeBuyoff({
    ...current,
    status: buyoffStatusForAction(input.action as RateVaultBuyoffAction),
    note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : current.note,
    decidedAt: new Date().toISOString(),
    decidedBy: typeof input.decidedBy === "string" && input.decidedBy.trim() ? input.decidedBy.trim() : "owner",
    writesRateBook: false,
  });
  buyoffs = buyoffs.map((row) => (row.id === id ? next : row));
  await persist();
  return { ok: true as const, buyoff: next };
}

export function storePayloadLeaksBinary(payload: unknown) {
  return /"data"\s*:|"bytes"\s*:|"content"\s*:/.test(JSON.stringify(payload ?? ""));
}
