import { ACTIVITY_STORE_PREFIX } from "./work-activities.ts";
import { FCR_STORE_PREFIX } from "./change-order-packet.ts";
import { EQUIPMENT_STORE_PREFIX } from "./equipment-sheet.ts";
import { OTHER_COST_STORE_PREFIX } from "./other-cost.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";
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
import { ORG_CHART_STORE_PREFIX } from "./org-chart.ts";

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
  sharedWith?: string[];
  transferredFrom?: string;
  transferredTo?: string;
  transferredToName?: string;
  transferredFromName?: string;
  schedule?: unknown;
  crew?: unknown;
  orgChart?: unknown;
  jobMeta?: unknown;
  activities?: unknown;
  equipment?: unknown;
  otherCost?: unknown;
  subcontractor?: unknown;
  fcr?: unknown;
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

export function equipmentHasWork(value: unknown) {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(arrayLen(row.largeTools) || arrayLen(row.thirdParty));
}

function travelHasMoney(travel: unknown) {
  if (!Array.isArray(travel)) return false;
  return travel.some((line) => {
    const item = asRecord(line);
    if (!item) return false;
    const travelers = Number(item.travelers) || 0;
    const miles = Number(item.miles) || 0;
    const perMile = Number(item.perMile) || 0;
    return travelers > 0 && miles > 0 && perMile > 0;
  });
}

function miscHasMoney(misc: unknown) {
  if (!Array.isArray(misc)) return false;
  return misc.some((line) => {
    const item = asRecord(line);
    if (!item) return false;
    const qty = Number(item.qty) || 0;
    const each = Number(item.each) || 0;
    const amount = Number(item.amount) || 0;
    return amount > 0 || (qty > 0 && each > 0);
  });
}

export function otherCostHasWork(value: unknown) {
  const other = asRecord(value);
  if (!other) return false;
  return Boolean(travelHasMoney(other.travel) || Number(other.perDiemRate) > 0 || miscHasMoney(other.misc));
}

export function subcontractorHasWork(value: unknown) {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(arrayLen(row.lines) || arrayLen(row.cards));
}

export function fcrHasWork(value: unknown) {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(
    arrayLen(row.log) ||
      arrayLen(row.people) ||
      Number(row.sub) > 0 ||
      Number(row.equipment) > 0 ||
      Number(row.misc) > 0,
  );
}

function pickEquipment(newer: unknown, older: unknown) {
  if (equipmentHasWork(newer)) return newer;
  if (equipmentHasWork(older)) return older;
  return newer ?? older;
}

function pickOtherCost(newer: unknown, older: unknown) {
  const next = asRecord(newer);
  const prev = asRecord(older);
  if (!next) return older;
  if (!prev) return newer;
  return {
    ...prev,
    ...next,
    travel: travelHasMoney(next.travel) ? next.travel : prev.travel ?? next.travel,
    misc: miscHasMoney(next.misc) ? next.misc : prev.misc ?? next.misc,
    perDiemRate: Number(next.perDiemRate) > 0 ? next.perDiemRate : prev.perDiemRate,
  };
}

function pickSubcontractor(newer: unknown, older: unknown) {
  if (subcontractorHasWork(newer)) return newer;
  if (subcontractorHasWork(older)) return older;
  return newer ?? older;
}

function pickFcr(newer: unknown, older: unknown) {
  if (fcrHasWork(newer)) return newer;
  if (fcrHasWork(older)) return older;
  return newer ?? older;
}

function writeSheetIfRicher(
  store: StorageLike,
  key: string,
  incoming: unknown,
  hasWork: (value: unknown) => boolean,
) {
  if (incoming == null) return;
  const existing = readStoreJson(store, key);
  if (!hasWork(incoming) && hasWork(existing)) return;
  writeStoreJson(store, key, incoming);
}

export function packHasWork(pack: EstimatePackSnapshot | null | undefined) {
  if (!pack?.packId) return false;
  if (pack.title && pack.title.trim() && pack.title !== "Working estimate") return true;
  if (crewHasRows(pack.crew)) return true;
  if (scheduleHasWork(pack.schedule)) return true;
  if (equipmentHasWork(pack.equipment)) return true;
  if (otherCostHasWork(pack.otherCost)) return true;
  if (subcontractorHasWork(pack.subcontractor)) return true;
  if (fcrHasWork(pack.fcr)) return true;
  if (Array.isArray(pack.activities) && pack.activities.some((row) => {
    const item = asRecord(row);
    return Boolean(item && (item.name || Number(item.hours) > 0));
  })) {
    return true;
  }
  return false;
}

export function packWasTransferred(pack: Pick<EstimatePackSnapshot, "transferredFrom">) {
  return Boolean((pack.transferredFrom || "").trim());
}

function packSheetScore(pack: EstimatePackSnapshot) {
  return (
    (equipmentHasWork(pack.equipment) ? 1 : 0) +
    (otherCostHasWork(pack.otherCost) ? 1 : 0) +
    (subcontractorHasWork(pack.subcontractor) ? 1 : 0) +
    (crewHasRows(pack.crew) ? 1 : 0)
  );
}

/** Same packId: transferred / richer working copy beats a thinner leftover. */
export function preferCanonicalPack(a: EstimatePackSnapshot, b: EstimatePackSnapshot): EstimatePackSnapshot {
  const aMoved = packWasTransferred(a);
  const bMoved = packWasTransferred(b);
  if (aMoved !== bMoved) return aMoved ? a : b;
  const aOwner = (a.ownerEmail || "").trim().toLowerCase();
  const bOwner = (b.ownerEmail || "").trim().toLowerCase();
  if (aOwner && bOwner && aOwner !== bOwner) {
    const aTo = (a.transferredTo || "").trim().toLowerCase();
    const bTo = (b.transferredTo || "").trim().toLowerCase();
    if (aTo === aOwner && bTo !== bOwner) return a;
    if (bTo === bOwner && aTo !== aOwner) return b;
  }
  const aScore = packSheetScore(a);
  const bScore = packSheetScore(b);
  if (aScore !== bScore) return aScore > bScore ? a : b;
  return (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
}

export function collapsePacksById(packs: EstimatePackSnapshot[]): EstimatePackSnapshot[] {
  const map = new Map<string, EstimatePackSnapshot>();
  for (const pack of packs) {
    const current = map.get(pack.packId);
    map.set(pack.packId, current ? preferCanonicalPack(current, pack) : pack);
  }
  return [...map.values()];
}

export function pickPack(
  local: EstimatePackSnapshot | null | undefined,
  vault: EstimatePackSnapshot | null | undefined,
): EstimatePackSnapshot | null {
  if (!vault?.packId) return local ?? null;
  if (!local?.packId) return packHasWork(vault) ? vault : local ?? null;
  const vaultMoved =
    packWasTransferred(vault) ||
    Boolean(
      vault.ownerEmail &&
        local.ownerEmail &&
        vault.ownerEmail.trim().toLowerCase() !== local.ownerEmail.trim().toLowerCase(),
    );
  if (!packHasWork(vault) && packHasWork(local) && !vaultMoved) {
    return {
      ...local,
      ownerEmail: vault.ownerEmail || local.ownerEmail,
      sharedWith: vault.sharedWith,
      transferredFrom: vault.transferredFrom,
      transferredTo: vault.transferredTo,
      transferredToName: vault.transferredToName,
      transferredFromName: vault.transferredFromName,
    };
  }
  const newer = (local.updatedAt || 0) >= (vault.updatedAt || 0) ? local : vault;
  const older = newer === local ? vault : local;
  return {
    ...newer,
    crew: crewHasRows(newer.crew) ? newer.crew : older.crew ?? newer.crew,
    orgChart: newer.orgChart ?? older.orgChart,
    schedule: scheduleHasWork(newer.schedule) ? newer.schedule : older.schedule ?? newer.schedule,
    jobMeta: newer.jobMeta ?? older.jobMeta,
    activities: newer.activities ?? older.activities,
    equipment: pickEquipment(newer.equipment, older.equipment),
    otherCost: pickOtherCost(newer.otherCost, older.otherCost),
    subcontractor: pickSubcontractor(newer.subcontractor, older.subcontractor),
    fcr: pickFcr(newer.fcr, older.fcr),
    createdAt: Math.min(local.createdAt || newer.createdAt, vault.createdAt || newer.createdAt) || newer.createdAt,
    ownerEmail: vault.ownerEmail || newer.ownerEmail,
    sharedWith: vault.sharedWith,
    transferredFrom: vault.transferredFrom,
    transferredTo: vault.transferredTo,
    transferredToName: vault.transferredToName,
    transferredFromName: vault.transferredFromName,
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
    sharedWith: pack.sharedWith,
    transferredFrom: pack.transferredFrom,
    transferredTo: pack.transferredTo,
    transferredToName: pack.transferredToName,
    transferredFromName: pack.transferredFromName,
    schedule: pack.schedule,
    crew: pack.crew,
    orgChart: pack.orgChart,
    jobMeta: pack.jobMeta,
    activities: pack.activities,
    equipment: pack.equipment,
    otherCost: pack.otherCost,
    subcontractor: pack.subcontractor,
    fcr: pack.fcr,
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
    sharedWith: identity.sharedWith,
    transferredFrom: identity.transferredFrom,
    transferredTo: identity.transferredTo,
    transferredToName: identity.transferredToName,
    transferredFromName: identity.transferredFromName,
    schedule: readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`) ?? undefined,
    crew: readStoreJson(store, `${CREW_STORE_PREFIX}${key}`) ?? undefined,
    orgChart: readStoreJson(store, `${ORG_CHART_STORE_PREFIX}${key}`) ?? undefined,
    jobMeta: readStoreJson(store, `${JOB_META_PREFIX}${key}`) ?? undefined,
    activities: readStoreJson(store, `${ACTIVITY_STORE_PREFIX}${key}`) ?? undefined,
    equipment: readStoreJson(store, `${EQUIPMENT_STORE_PREFIX}${key}`) ?? undefined,
    otherCost: readStoreJson(store, `${OTHER_COST_STORE_PREFIX}${key}`) ?? undefined,
    subcontractor: readStoreJson(store, `${SUB_STORE_PREFIX}${key}`) ?? undefined,
    fcr: readStoreJson(store, `${FCR_STORE_PREFIX}${key}`) ?? undefined,
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
      sharedWith: pack.sharedWith,
      transferredFrom: pack.transferredFrom,
      transferredTo: pack.transferredTo,
      transferredToName: pack.transferredToName,
      transferredFromName: pack.transferredFromName,
      replaceHandoff: true,
    },
    store,
  );
  touchLocalPack(pack.packId, pack.updatedAt || Date.now(), store, pack.createdAt);
  const key = storageKeyForPack(pack.packId);
  if (pack.schedule != null) writeStoreJson(store, `${PHASE_STORE_PREFIX}${key}`, pack.schedule);
  if (pack.crew != null) writeStoreJson(store, `${CREW_STORE_PREFIX}${key}`, pack.crew);
  if (pack.orgChart != null) writeStoreJson(store, `${ORG_CHART_STORE_PREFIX}${key}`, pack.orgChart);
  if (pack.jobMeta != null) writeStoreJson(store, `${JOB_META_PREFIX}${key}`, pack.jobMeta);
  if (pack.activities != null) writeStoreJson(store, `${ACTIVITY_STORE_PREFIX}${key}`, pack.activities);
  writeSheetIfRicher(store, `${EQUIPMENT_STORE_PREFIX}${key}`, pack.equipment, equipmentHasWork);
  if (pack.otherCost != null) {
    writeStoreJson(
      store,
      `${OTHER_COST_STORE_PREFIX}${key}`,
      pickOtherCost(pack.otherCost, readStoreJson(store, `${OTHER_COST_STORE_PREFIX}${key}`)),
    );
  }
  writeSheetIfRicher(store, `${SUB_STORE_PREFIX}${key}`, pack.subcontractor, subcontractorHasWork);
  writeSheetIfRicher(store, `${FCR_STORE_PREFIX}${key}`, pack.fcr, fcrHasWork);
  notifyEstimateSheets();
}

export function mergeVaultIntoLocal(store: StorageLike, vault: EstimatePackSnapshot) {
  const local = collectPack(store, vault.packId, vault.ownerEmail);
  const winner = pickPack(local, vault);
  if (!winner) return "skip" as const;
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
    sharedWith: Array.isArray(row?.sharedWith)
      ? row.sharedWith.filter((item): item is string => typeof item === "string")
      : undefined,
    transferredFrom: typeof row?.transferredFrom === "string" ? row.transferredFrom : undefined,
    transferredTo: typeof row?.transferredTo === "string" ? row.transferredTo : undefined,
    transferredToName: typeof row?.transferredToName === "string" ? row.transferredToName : undefined,
    transferredFromName: typeof row?.transferredFromName === "string" ? row.transferredFromName : undefined,
    schedule: row?.schedule,
      crew: row?.crew,
      orgChart: row?.orgChart,
      jobMeta: row?.jobMeta,
      activities: row?.activities,
      equipment: row?.equipment,
      otherCost: row?.otherCost,
      subcontractor: row?.subcontractor,
      fcr: row?.fcr,
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
