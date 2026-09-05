import { clampEstimateStatus, parseEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import { ACTIVITY_STORE_PREFIX } from "./work-activities.ts";
import { newEstimateKey } from "./estimate-open.ts";
import { EQUIPMENT_STORE_PREFIX } from "./equipment-sheet.ts";
import { FCR_STORE_PREFIX } from "./change-order-packet.ts";
import { OTHER_COST_STORE_PREFIX } from "./other-cost.ts";
import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { SUB_STORE_PREFIX } from "./subcontractor.ts";
import { JOB_META_PREFIX } from "./staffing-plan.ts";
import { ORG_CHART_STORE_PREFIX } from "./org-chart.ts";
import type { EstimateRecord, ForgebookBoard, JobRecord } from "./types.ts";

export const PACK_INDEX_KEY = "hs_pack_index_v1";
export const PACK_STORE_PREFIX = "hs_pack_v1:";
export const PACK_TITLE_MAX = 80;

const STORE_PREFIXES = [
  CREW_STORE_PREFIX,
  PHASE_STORE_PREFIX,
  JOB_META_PREFIX,
  ORG_CHART_STORE_PREFIX,
  ACTIVITY_STORE_PREFIX,
  EQUIPMENT_STORE_PREFIX,
  OTHER_COST_STORE_PREFIX,
  SUB_STORE_PREFIX,
  FCR_STORE_PREFIX,
  PACK_STORE_PREFIX,
];

export type LocalPack = {
  packId: string;
  key: string;
  title: string;
  client: string;
  site: string;
  size?: string;
  siteId: string;
  createdAt: number;
  updatedAt: number;
  ownerEmail?: string;
  archived?: boolean;
  estimator?: string;
  sharedWith?: string[];
  transferredFrom?: string;
  transferredTo?: string;
  transferredToName?: string;
  transferredFromName?: string;
  /** Live estimate workflow status. Pack is source of truth. */
  status?: EstimateStatus;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
  readonly length?: number;
  key?(index: number): string | null;
};

function memoryKeys(store: StorageLike): string[] {
  if (typeof store.key === "function" && typeof store.length === "number") {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const item = store.key(i);
      if (item) keys.push(item);
    }
    return keys;
  }
  return Object.keys(store as unknown as Record<string, string>);
}

export function siteIdFromSite(site = "", client = ""): string {
  const hay = `${site} ${client}`.toLowerCase();
  if (/\bcbi\b/.test(hay)) return "site-shop";
  if (hay.includes("yates") || hay.includes("georgia power")) return "site-yates";
  if (hay.includes("rodeo")) return "site-rodeo";
  if (hay.includes("bayway")) return "site-bayway";
  if (hay.includes("ferndale")) return "site-ferndale";
  if (hay.includes("billings")) return "site-billings";
  if (hay.includes("monroe") || hay.includes("trainer")) return "site-monroe";
  return "site-madison";
}

export function packIdFromStoreKey(storeKey: string): string | null {
  if (!storeKey.startsWith("new:")) return null;
  const packId = storeKey.slice("new:".length);
  return packId.startsWith("new-") ? packId : null;
}

export function storageKeyForPack(packId: string): string {
  return newEstimateKey(packId);
}

export function readStoreJson<T>(store: StorageLike, key: string): T | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStoreJson(store: StorageLike, key: string, value: unknown) {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // keep the previous copy
  }
}

function readIndex(store: StorageLike): LocalPack[] {
  const parsed = readStoreJson<LocalPack[]>(store, PACK_INDEX_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((row) => row && typeof row.packId === "string" && row.packId.startsWith("new-"));
}

function writeIndex(store: StorageLike, rows: LocalPack[]) {
  writeStoreJson(store, PACK_INDEX_KEY, rows);
}

/** Trim and cap. Empty is rejected — do not invent a job name. */
export function normalizePackTitle(value: string): string | null {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return title.slice(0, PACK_TITLE_MAX);
}

export function renameLocalPackTitle(
  packId: string,
  title: string,
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  const next = normalizePackTitle(title);
  if (!next || !store || !packId.startsWith("new-")) return null;
  const current = findLocalPack(packId, store);
  return rememberLocalPack(
    {
      packId,
      title: next,
      client: current?.client || "",
      site: current?.site || "",
      size: current?.size,
      ownerEmail: current?.ownerEmail,
      estimator: current?.estimator,
      status: current?.status,
    },
    store,
  );
}

export function writeLocalPackStatus(
  packId: string,
  status: EstimateStatus,
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  if (!store || !packId.startsWith("new-")) return null;
  const current = findLocalPack(packId, store);
  if (!current) return null;
  return rememberLocalPack(
    {
      packId,
      title: current.title,
      client: current.client,
      site: current.site,
      size: current.size,
      ownerEmail: current.ownerEmail,
      estimator: current.estimator,
      status: parseEstimateStatus(status),
    },
    store,
  );
}

function upsertIndex(store: StorageLike, next: LocalPack) {
  const index = readIndex(store).filter((row) => row.packId !== next.packId);
  index.unshift(next);
  writeIndex(store, index);
}

export function rememberLocalPack(
  input: {
    packId: string;
    title: string;
    client: string;
    site: string;
    size?: string;
    ownerEmail?: string;
    archived?: boolean;
    estimator?: string;
    sharedWith?: string[];
    transferredFrom?: string;
    transferredTo?: string;
    transferredToName?: string;
    transferredFromName?: string;
    replaceHandoff?: boolean;
    status?: EstimateStatus;
  },
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  if (!store || !input.packId.startsWith("new-")) return null;
  const key = storageKeyForPack(input.packId);
  const existing = readStoreJson<Partial<LocalPack>>(store, `${PACK_STORE_PREFIX}${key}`);
  const now = Date.now();
  const title = input.title.trim() || existing?.title || "Working estimate";
  const client = input.client || existing?.client || "Phillips 66";
  const site = input.site || existing?.site || "Wood River — Roxana, IL";
  const size = input.size ?? existing?.size;
  const rawStatus =
    input.status !== undefined
      ? parseEstimateStatus(input.status)
      : existing?.status
        ? parseEstimateStatus(existing.status)
        : undefined;
  const status = rawStatus ? clampEstimateStatus(rawStatus, site, client) : undefined;
  const unchanged =
    existing &&
    existing.title === title &&
    existing.client === client &&
    existing.site === site &&
    existing.size === size &&
    existing.status === status;
  const next: LocalPack = {
    packId: input.packId,
    key,
    title,
    client,
    site,
    size,
    siteId: siteIdFromSite(site, client),
    createdAt: existing?.createdAt || now,
    updatedAt: unchanged ? existing.updatedAt || existing.createdAt || now : now,
    ownerEmail: input.ownerEmail || existing?.ownerEmail,
    archived: input.archived ?? existing?.archived,
    estimator: input.estimator || existing?.estimator,
    sharedWith: input.replaceHandoff ? input.sharedWith : (input.sharedWith ?? existing?.sharedWith),
    transferredFrom: input.replaceHandoff ? input.transferredFrom : (input.transferredFrom ?? existing?.transferredFrom),
    transferredTo: input.replaceHandoff ? input.transferredTo : (input.transferredTo ?? existing?.transferredTo),
    transferredToName: input.replaceHandoff ? input.transferredToName : (input.transferredToName ?? existing?.transferredToName),
    transferredFromName: input.replaceHandoff
      ? input.transferredFromName
      : (input.transferredFromName ?? existing?.transferredFromName),
    status,
  };
  writeStoreJson(store, `${PACK_STORE_PREFIX}${next.key}`, next);
  upsertIndex(store, next);
  return next;
}

export function touchLocalPack(
  packId: string,
  updatedAt = Date.now(),
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
  createdAt?: number,
): LocalPack | null {
  if (!store || !packId.startsWith("new-")) return null;
  const current = packFromStore(packId, store);
  const next: LocalPack = {
    ...current,
    createdAt: createdAt || current.createdAt || updatedAt,
    updatedAt,
  };
  writeStoreJson(store, `${PACK_STORE_PREFIX}${next.key}`, next);
  upsertIndex(store, next);
  return next;
}

export function scanStoredPackIds(store: StorageLike): string[] {
  const ids = new Set<string>();
  for (const key of memoryKeys(store)) {
    for (const prefix of STORE_PREFIXES) {
      if (!key.startsWith(prefix)) continue;
      const packId = packIdFromStoreKey(key.slice(prefix.length));
      if (packId) ids.add(packId);
    }
  }
  for (const row of readIndex(store)) ids.add(row.packId);
  return [...ids];
}

function packFromStore(packId: string, store: StorageLike): LocalPack {
  const key = storageKeyForPack(packId);
  const saved = readStoreJson<Partial<LocalPack>>(store, `${PACK_STORE_PREFIX}${key}`);
  const indexed = readIndex(store).find((row) => row.packId === packId);
  const title = saved?.title || indexed?.title || "Working estimate";
  const client = saved?.client || indexed?.client || "Phillips 66";
  const site = saved?.site || indexed?.site || "Wood River — Roxana, IL";
  const createdAt = saved?.createdAt || indexed?.createdAt || 0;
  return {
    packId,
    key,
    title,
    client,
    site,
    size: saved?.size || indexed?.size,
    siteId: saved?.siteId || indexed?.siteId || siteIdFromSite(site, client),
    createdAt,
    updatedAt: saved?.updatedAt || indexed?.updatedAt || createdAt,
    ownerEmail: saved?.ownerEmail || indexed?.ownerEmail,
    archived: saved?.archived ?? indexed?.archived,
    estimator: saved?.estimator || indexed?.estimator,
    sharedWith: saved?.sharedWith || indexed?.sharedWith,
    transferredFrom: saved?.transferredFrom || indexed?.transferredFrom,
    transferredTo: saved?.transferredTo || indexed?.transferredTo,
    transferredToName: saved?.transferredToName || indexed?.transferredToName,
    transferredFromName: saved?.transferredFromName || indexed?.transferredFromName,
    status: saved?.status || indexed?.status ? parseEstimateStatus(saved?.status || indexed?.status) : undefined,
  };
}

export function listLocalPacks(
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack[] {
  if (!store) return [];
  const rows = scanStoredPackIds(store).map((packId) => packFromStore(packId, store));
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function findLocalPack(
  packId: string,
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  if (!packId.startsWith("new-")) return null;
  return listLocalPacks(store).find((row) => row.packId === packId) ?? null;
}

export function deleteLocalPack(
  packId: string,
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!store || !packId.startsWith("new-")) return;
  const key = storageKeyForPack(packId);
  for (const prefix of STORE_PREFIXES) {
    store.removeItem?.(`${prefix}${key}`);
  }
  writeIndex(
    store,
    readIndex(store).filter((row) => row.packId !== packId),
  );
}

export function localPackToEstimate(pack: LocalPack, ownerId = "owner-robert-henderson"): EstimateRecord {
  const raw = (pack.packId || "").trim();
  const coded = raw.toUpperCase().match(/EST-([A-Z0-9]{6})/);
  const code = coded ? `EST-${coded[1]}` : `EST-${raw.replace(/^new-/i, "").slice(0, 6).toUpperCase()}`;
  return {
    id: pack.packId,
    ownerId,
    siteId: pack.siteId,
    code,
    title: pack.title,
    client: pack.client,
    unit: pack.site.split("—")[0]?.trim() || pack.site,
    type: "T&M",
    status: "WORKING",
    window: "This job",
    labor: "",
    material: "",
    total: "",
    estimator: pack.estimator || "Robert Henderson",
    revision: "A",
  };
}

export function localPackToJob(pack: LocalPack, ownerId = "owner-robert-henderson"): JobRecord {
  const estimate = localPackToEstimate(pack, ownerId);
  return {
    id: `job-${pack.packId}`,
    ownerId,
    code: estimate.code,
    title: pack.title,
    client: pack.client,
    discipline: "mechanical",
    kind: "estimate",
    status: "OPEN",
    window: "This job",
    workingFigure: "Working",
    hseNote: "On this desk",
  };
}

export function mergeLocalEstimates(estimates: EstimateRecord[], packs: LocalPack[]): EstimateRecord[] {
  const extras = packs.map((pack) => localPackToEstimate(pack));
  const seen = new Set(estimates.map((row) => row.id));
  return [...estimates, ...extras.filter((row) => !seen.has(row.id))];
}

export function mergeLocalJobs(jobs: JobRecord[], packs: LocalPack[]): JobRecord[] {
  const extras = packs.map((pack) => localPackToJob(pack));
  const seen = new Set(jobs.map((row) => row.id));
  return [...jobs, ...extras.filter((row) => !seen.has(row.id))];
}

export function mergeLocalBoard(board: ForgebookBoard, packs: LocalPack[]): ForgebookBoard {
  return {
    ...board,
    estimates: mergeLocalEstimates(board.estimates, packs),
  };
}

export function isLocalPackId(id: string): boolean {
  return id.startsWith("new-");
}
