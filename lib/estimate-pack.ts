import { ACTIVITY_STORE_PREFIX } from "./work-activities.ts";
import { EQUIPMENT_STORE_PREFIX } from "./equipment-sheet.ts";
import { OTHER_COST_STORE_PREFIX } from "./other-cost.ts";
import { SUB_STORE_PREFIX } from "./subcontractor.ts";
import {
  findLocalPack,
  isLocalPackId,
  packIdFromStoreKey,
  readStoreJson,
  rememberLocalPack,
  storageKeyForPack,
  touchLocalPack,
  writeStoreJson,
  type StorageLike,
} from "./local-estimates.ts";
import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { JOB_META_PREFIX } from "./staffing-plan.ts";

export type EstimatePackSnapshot = {
  packId: string;
  key: string;
  title: string;
  client: string;
  site: string;
  size?: string;
  siteId: string;
  createdAt: number;
  updatedAt: number;
  ownerEmail: string;
  archived?: boolean;
  transferredFrom?: string;
  transferredTo?: string;
  transferredToName?: string;
  schedule?: unknown;
  crew?: unknown;
  jobMeta?: unknown;
  activities?: unknown;
  equipment?: unknown;
  otherCost?: unknown;
  subcontractor?: unknown;
};

const CREW_LANES = ["staff", "generalForeman", "foreman", "direct", "support"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayLen(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function estimateFileName(input: { site?: string; title?: string; packId?: string }, taken: Iterable<string> = []) {
  const used = new Set(taken);
  const site = slugify((input.site || "").split("—")[0] || "");
  const title = slugify(input.title || "");
  const base = [site, title].filter(Boolean).join("-") || "estimate";
  let name = `${base}.json`;
  if (used.has(name) && input.packId) {
    const short = slugify(input.packId.replace(/^new-/, "")).slice(0, 8);
    name = `${base}-${short}.json`;
  }
  return name;
}

export function crewHasRows(crew: unknown) {
  const row = asRecord(crew);
  if (!row) return false;
  return CREW_LANES.some((lane) => arrayLen(row[lane]) > 0);
}

export function scheduleHasWork(schedule: unknown) {
  const row = asRecord(schedule);
  if (!row) return false;
  const phases = Array.isArray(row.phases) ? row.phases : [];
  return phases.some((phase) => {
    const item = asRecord(phase);
    return Boolean(item && (item.on || item.start || item.stop));
  });
}

export function packHasWork(pack: EstimatePackSnapshot | null | undefined) {
  if (!pack?.packId) return false;
  if (pack.title && pack.title.trim() && pack.title !== "Working estimate") return true;
  if (crewHasRows(pack.crew)) return true;
  if (scheduleHasWork(pack.schedule)) return true;
  if (arrayLen(asRecord(pack.equipment)?.largeTools) || arrayLen(asRecord(pack.equipment)?.thirdParty)) {
    return true;
  }
  const other = asRecord(pack.otherCost);
  if (other && (arrayLen(other.travel) || Number(other.perDiemRate) > 0)) return true;
  if (arrayLen(asRecord(pack.subcontractor)?.lines) || arrayLen(asRecord(pack.subcontractor)?.cards)) return true;
  if (Array.isArray(pack.activities) && pack.activities.some((row) => {
    const item = asRecord(row);
    return Boolean(item && (item.name || Number(item.hours) > 0));
  })) {
    return true;
  }
  return false;
}

export function pickPack(
  local: EstimatePackSnapshot | null | undefined,
  vault: EstimatePackSnapshot | null | undefined,
): EstimatePackSnapshot | null {
  if (!vault?.packId) return local ?? null;
  if (!local?.packId) return packHasWork(vault) ? vault : local ?? null;
  if (!packHasWork(vault) && packHasWork(local)) return local;
  const newer = (local.updatedAt || 0) >= (vault.updatedAt || 0) ? local : vault;
  const older = newer === local ? vault : local;
  return {
    ...newer,
    crew: crewHasRows(newer.crew) ? newer.crew : older.crew ?? newer.crew,
    schedule: scheduleHasWork(newer.schedule) ? newer.schedule : older.schedule ?? newer.schedule,
    jobMeta: newer.jobMeta ?? older.jobMeta,
    activities: newer.activities ?? older.activities,
    equipment: newer.equipment ?? older.equipment,
    otherCost: newer.otherCost ?? older.otherCost,
    subcontractor: newer.subcontractor ?? older.subcontractor,
    createdAt: Math.min(local.createdAt || newer.createdAt, vault.createdAt || newer.createdAt) || newer.createdAt,
  };
}

export function publicPack(pack: EstimatePackSnapshot): EstimatePackSnapshot {
  return {
    packId: pack.packId,
    key: pack.key,
    title: pack.title,
    client: pack.client,
    site: pack.site,
    size: pack.size,
    siteId: pack.siteId,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    ownerEmail: pack.ownerEmail,
    archived: pack.archived,
    transferredFrom: pack.transferredFrom,
    transferredTo: pack.transferredTo,
    transferredToName: pack.transferredToName,
    schedule: pack.schedule,
    crew: pack.crew,
    jobMeta: pack.jobMeta,
    activities: pack.activities,
    equipment: pack.equipment,
    otherCost: pack.otherCost,
    subcontractor: pack.subcontractor,
  };
}

export function responseLeaksDrive(payload: unknown) {
  const text = JSON.stringify(payload);
  return /1y6Q3TOnpXzV|1zYl2dEvW21|141Js9RQZKXq|1FevAKYcC4hxb|drive\.google\.com\/drive\/folders/i.test(text);
}

export function collectPack(
  store: StorageLike,
  packId: string,
  ownerEmail = "",
): EstimatePackSnapshot | null {
  if (!isLocalPackId(packId)) return null;
  const identity = findLocalPack(packId, store);
  if (!identity) return null;
  const key = storageKeyForPack(packId);
  return {
    packId: identity.packId,
    key: identity.key,
    title: identity.title,
    client: identity.client,
    site: identity.site,
    size: identity.size,
    siteId: identity.siteId,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt || identity.createdAt || 0,
    ownerEmail: ownerEmail || identity.ownerEmail || "",
    archived: identity.archived,
    schedule: readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`) ?? undefined,
    crew: readStoreJson(store, `${CREW_STORE_PREFIX}${key}`) ?? undefined,
    jobMeta: readStoreJson(store, `${JOB_META_PREFIX}${key}`) ?? undefined,
    activities: readStoreJson(store, `${ACTIVITY_STORE_PREFIX}${key}`) ?? undefined,
    equipment: readStoreJson(store, `${EQUIPMENT_STORE_PREFIX}${key}`) ?? undefined,
    otherCost: readStoreJson(store, `${OTHER_COST_STORE_PREFIX}${key}`) ?? undefined,
    subcontractor: readStoreJson(store, `${SUB_STORE_PREFIX}${key}`) ?? undefined,
  };
}

export function applyPackToStore(store: StorageLike, pack: EstimatePackSnapshot) {
  if (!isLocalPackId(pack.packId)) return;
  rememberLocalPack(
    {
      packId: pack.packId,
      title: pack.title,
      client: pack.client,
      site: pack.site,
      size: pack.size,
      ownerEmail: pack.ownerEmail,
      archived: pack.archived,
    },
    store,
  );
  touchLocalPack(pack.packId, pack.updatedAt || Date.now(), store, pack.createdAt);
  const key = storageKeyForPack(pack.packId);
  if (pack.schedule != null) writeStoreJson(store, `${PHASE_STORE_PREFIX}${key}`, pack.schedule);
  if (pack.crew != null) writeStoreJson(store, `${CREW_STORE_PREFIX}${key}`, pack.crew);
  if (pack.jobMeta != null) writeStoreJson(store, `${JOB_META_PREFIX}${key}`, pack.jobMeta);
  if (pack.activities != null) writeStoreJson(store, `${ACTIVITY_STORE_PREFIX}${key}`, pack.activities);
  if (pack.equipment != null) writeStoreJson(store, `${EQUIPMENT_STORE_PREFIX}${key}`, pack.equipment);
  if (pack.otherCost != null) writeStoreJson(store, `${OTHER_COST_STORE_PREFIX}${key}`, pack.otherCost);
  if (pack.subcontractor != null) writeStoreJson(store, `${SUB_STORE_PREFIX}${key}`, pack.subcontractor);
}

export function mergeVaultIntoLocal(store: StorageLike, vault: EstimatePackSnapshot) {
  const local = collectPack(store, vault.packId, vault.ownerEmail);
  const winner = pickPack(local, vault);
  if (!winner) return "skip" as const;
  if (winner === local) return "local" as const;
  applyPackToStore(store, winner);
  return local ? ("local" as const) : ("vault" as const);
}

export function packIdFromEstimateKey(estimateKey: string) {
  return packIdFromStoreKey(estimateKey);
}

export function parseIncomingPack(input: unknown): { ok: true; pack: EstimatePackSnapshot } | { ok: false; error: string } {
  const row = asRecord(input);
  const packId = typeof row?.packId === "string" ? row.packId : "";
  if (!isLocalPackId(packId)) return { ok: false, error: "Missing package." };
  const title = typeof row?.title === "string" ? row.title : "Working estimate";
  const client = typeof row?.client === "string" ? row.client : "Phillips 66";
  const site = typeof row?.site === "string" ? row.site : "Wood River — Roxana, IL";
  return {
    ok: true,
    pack: {
      packId,
      key: typeof row?.key === "string" ? row.key : storageKeyForPack(packId),
      title,
      client,
      site,
      size: typeof row?.size === "string" ? row.size : undefined,
      siteId: typeof row?.siteId === "string" ? row.siteId : "site-madison",
      createdAt: Number(row?.createdAt) || Date.now(),
      updatedAt: Number(row?.updatedAt) || Date.now(),
    ownerEmail: typeof row?.ownerEmail === "string" ? row.ownerEmail : "",
    archived: Boolean(row?.archived),
    transferredFrom: typeof row?.transferredFrom === "string" ? row.transferredFrom : undefined,
    transferredTo: typeof row?.transferredTo === "string" ? row.transferredTo : undefined,
    transferredToName: typeof row?.transferredToName === "string" ? row.transferredToName : undefined,
    schedule: row?.schedule,
      crew: row?.crew,
      jobMeta: row?.jobMeta,
      activities: row?.activities,
      equipment: row?.equipment,
      otherCost: row?.otherCost,
      subcontractor: row?.subcontractor,
    },
  };
}

export function scheduleOnce(wait: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (key: string, fn: () => void) => {
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, wait),
    );
  };
}
