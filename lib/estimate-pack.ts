import {
  aromaticsPackIsThinner,
  aromaticsPackLooksSmashed,
  aromaticsSourceCanRestore,
  isAromaticsIdentity,
} from "./aromatics-freeze.ts";
import {
  decidePackWrite,
  incomingBreaksFingerprint,
  packHasDemoSeedClock,
  packHasForeignAfeName,
  packIsVaultCanonical,
  packLooksCrossPackGrafted,
  packLooksSmashed,
  readPackFingerprint,
  rememberPackFingerprint,
} from "./pack-integrity.ts";
import { catalogSites } from "./desk-data.ts";
import { parseEstimateStatus, resolveEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import { clampStatusForSite, regularClientFromParts } from "./site-regular.ts";
import { ACTIVITY_STORE_PREFIX } from "./work-activities.ts";
import { FCR_STORE_PREFIX, fcrPacketHasWork } from "./change-order-packet.ts";
import { COST_REPORT_STORE_PREFIX, costReportHasWork } from "./cost-report.ts";
import { PURCHASING_STORE_PREFIX } from "./purchasing-prefix.ts";
import { purchasingHasWork } from "./purchasing.ts";
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
import {
  CREW_STORE_PREFIX,
  PHASE_STORE_PREFIX,
  isDefaultSeedSchedule,
  rangesHaveCustomClock,
} from "./phase-schedule.ts";
import { JOB_META_PREFIX } from "./staffing-plan.ts";
import { ORG_CHART_STORE_PREFIX } from "./org-chart.ts";

const AROMATICS_PACK_ID = "new-mtj7bvtk-akmei";

function isAromaticsPack(pack: { packId?: string; title?: string } | null | undefined) {
  return isAromaticsIdentity(pack);
}

function scheduleHasPayload(schedule: unknown) {
  const row = asRecord(schedule);
  if (!row) return false;
  if (typeof row.projectStart === "string" && row.projectStart.trim()) return true;
  return Array.isArray(row.phases) && row.phases.length > 0;
}

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
  /** Desk-owned workflow status. Excel stamps this; import does not overwrite it. */
  status?: EstimateStatus;
  schedule?: unknown;
  crew?: unknown;
  orgChart?: unknown;
  jobMeta?: unknown;
  activities?: unknown;
  equipment?: unknown;
  otherCost?: unknown;
  subcontractor?: unknown;
  fcr?: unknown;
  costReport?: unknown;
  purchasing?: unknown;
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
  if (isDefaultSeedSchedule(schedule)) return false;
  const row = asRecord(schedule);
  if (!row) return false;
  const phases = Array.isArray(row.phases) ? row.phases : [];
  return phases.some((phase) => {
    const item = asRecord(phase);
    return Boolean(item && (item.on || item.start || item.stop));
  });
}

export function crewHasCustomClock(crew: unknown) {
  const row = asRecord(crew);
  if (!row) return false;
  return CREW_LANES.some((lane) => {
    const list = row[lane];
    if (!Array.isArray(list)) return false;
    return list.some((item) => rangesHaveCustomClock((asRecord(item)?.ranges as Array<{ start?: string; end?: string }>) ?? []));
  });
}

/** Live pack whose Job setup / crew calendars were remapped onto the 2026 demo seed. */
export function packClockIsSeedSmashed(pack: EstimatePackSnapshot | null | undefined) {
  if (!pack?.packId) return false;
  if (isAromaticsPack(pack)) return aromaticsPackLooksSmashed(pack);
  if (packLooksSmashed(pack)) return true;
  return isDefaultSeedSchedule(pack.schedule) && crewHasRows(pack.crew) && !crewHasCustomClock(pack.crew);
}

function withVaultIdentity(local: EstimatePackSnapshot, vault: EstimatePackSnapshot): EstimatePackSnapshot {
  return {
    ...local,
    ownerEmail: vault.ownerEmail || local.ownerEmail,
    sharedWith: vault.sharedWith,
    transferredFrom: vault.transferredFrom,
    transferredTo: vault.transferredTo,
    transferredToName: vault.transferredToName,
    transferredFromName: vault.transferredFromName,
    status: vault.status || local.status,
  };
}

function keepLiveIdentity(live: EstimatePackSnapshot, restored: EstimatePackSnapshot): EstimatePackSnapshot {
  return {
    ...restored,
    packId: live.packId,
    key: live.key,
    ownerEmail: live.ownerEmail,
    sharedWith: live.sharedWith,
    transferredFrom: live.transferredFrom,
    transferredTo: live.transferredTo,
    transferredToName: live.transferredToName,
    transferredFromName: live.transferredFromName,
    status: live.status,
    archived: live.archived,
  };
}

/** Overlay freeze Job setup, crew, and smashed sheets. Keep live identity. */
export function restorePackClock(live: EstimatePackSnapshot, baseline: EstimatePackSnapshot): EstimatePackSnapshot {
  const restored: EstimatePackSnapshot = {
    ...live,
    schedule: baseline.schedule ?? live.schedule,
    crew: baseline.crew ?? live.crew,
    otherCost: baseline.otherCost ?? live.otherCost,
    equipment: baseline.equipment ?? live.equipment,
    subcontractor: baseline.subcontractor ?? live.subcontractor,
    activities: baseline.activities ?? live.activities,
    jobMeta: baseline.jobMeta ?? live.jobMeta,
    orgChart: baseline.orgChart ?? live.orgChart,
    updatedAt: Math.max(live.updatedAt || 0, baseline.updatedAt || 0, Date.now()),
  };
  return keepLiveIdentity(live, restored);
}

function pickSchedule(newer: unknown, older: unknown) {
  if (scheduleHasWork(newer)) return newer;
  if (scheduleHasWork(older)) return older;
  return newer ?? older;
}

function pickCrew(newer: unknown, older: unknown) {
  if (crewHasCustomClock(newer)) return newer;
  if (crewHasCustomClock(older)) return older;
  return crewHasRows(newer) ? newer : older ?? newer;
}

function pickScheduleForPack(newer: EstimatePackSnapshot, older: EstimatePackSnapshot) {
  const newerGraft = packLooksCrossPackGrafted(newer);
  const olderGraft = packLooksCrossPackGrafted(older);
  if (newerGraft && !olderGraft) return older.schedule ?? newer.schedule;
  if (!newerGraft && olderGraft) return newer.schedule ?? older.schedule;
  return pickSchedule(newer.schedule, older.schedule);
}

function pickCrewForPack(newer: EstimatePackSnapshot, older: EstimatePackSnapshot) {
  const newerGraft = packLooksCrossPackGrafted(newer);
  const olderGraft = packLooksCrossPackGrafted(older);
  if (newerGraft && !olderGraft) return older.crew ?? newer.crew;
  if (!newerGraft && olderGraft) return newer.crew ?? older.crew;
  return pickCrew(newer.crew, older.crew);
}

function pickJobMetaForPack(newer: EstimatePackSnapshot, older: EstimatePackSnapshot) {
  if (packHasForeignAfeName(newer) && !packHasForeignAfeName(older)) return older.jobMeta ?? newer.jobMeta;
  if (!packHasForeignAfeName(newer) && packHasForeignAfeName(older)) return newer.jobMeta ?? older.jobMeta;
  return newer.jobMeta ?? older.jobMeta;
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
  return fcrPacketHasWork(value);
}

export { costReportHasWork, purchasingHasWork };

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

function pickCostReport(newer: unknown, older: unknown) {
  if (costReportHasWork(newer)) return newer;
  if (costReportHasWork(older)) return older;
  return newer ?? older;
}

function pickPurchasing(newer: unknown, older: unknown) {
  if (purchasingHasWork(newer)) return newer;
  if (purchasingHasWork(older)) return older;
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

export function packHasSheets(pack: EstimatePackSnapshot | null | undefined) {
  if (!pack?.packId) return false;
  return (
    crewHasRows(pack.crew) ||
    scheduleHasWork(pack.schedule) ||
    equipmentHasWork(pack.equipment) ||
    otherCostHasWork(pack.otherCost) ||
    subcontractorHasWork(pack.subcontractor) ||
    fcrHasWork(pack.fcr) ||
    costReportHasWork(pack.costReport) ||
    purchasingHasWork(pack.purchasing) ||
    (Array.isArray(pack.activities) &&
      pack.activities.some((row) => {
        const item = asRecord(row);
        return Boolean(item && (item.name || Number(item.hours) > 0));
      }))
  );
}

export function packHasWork(pack: EstimatePackSnapshot | null | undefined) {
  if (!pack?.packId) return false;
  if (packHasSheets(pack)) return true;
  if (pack.title && pack.title.trim() && pack.title !== "Working estimate") return true;
  if (crewHasRows(pack.crew)) return true;
  if (scheduleHasWork(pack.schedule)) return true;
  if (equipmentHasWork(pack.equipment)) return true;
  if (otherCostHasWork(pack.otherCost)) return true;
  if (subcontractorHasWork(pack.subcontractor)) return true;
  if (fcrHasWork(pack.fcr)) return true;
  if (costReportHasWork(pack.costReport)) return true;
  if (purchasingHasWork(pack.purchasing)) return true;
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
    (crewHasRows(pack.crew) ? 1 : 0) +
    (fcrHasWork(pack.fcr) ? 1 : 0) +
    (costReportHasWork(pack.costReport) ? 1 : 0) +
    (purchasingHasWork(pack.purchasing) ? 1 : 0)
  );
}

/**
 * Same packId: Drive-healthy / transferred / richer working copy beats a thinner leftover.
 * A smashed or grafted copy cannot beat a good vault copy — all seats share one clock/total.
 */
export function preferCanonicalPack(a: EstimatePackSnapshot, b: EstimatePackSnapshot): EstimatePackSnapshot {
  const aSmash = packLooksSmashed(a) || packLooksCrossPackGrafted(a);
  const bSmash = packLooksSmashed(b) || packLooksCrossPackGrafted(b);
  if (aSmash !== bSmash) return aSmash ? b : a;
  const aCanon = packIsVaultCanonical(a);
  const bCanon = packIsVaultCanonical(b);
  if (aCanon !== bCanon) return aCanon ? a : b;
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

/**
 * Hydrate / upsert merge. Drive vault is canonical for shared packs:
 * stale, thin, demo, or cross-pack local cannot beat a good vault, so every
 * seat hard-refreshes to the same Estimate Total and crew/clock.
 */
export function pickPack(
  local: EstimatePackSnapshot | null | undefined,
  vault: EstimatePackSnapshot | null | undefined,
): EstimatePackSnapshot | null {
  if (!vault?.packId) return local ?? null;
  if (!local?.packId) {
    if (packLooksCrossPackGrafted(vault)) return null;
    return packHasWork(vault) ? vault : local ?? null;
  }
  if (isAromaticsPack(local) || isAromaticsPack(vault)) {
    if (packClockIsSeedSmashed(local) && aromaticsSourceCanRestore(vault)) {
      return {
        ...restorePackClock(local, vault),
        ownerEmail: vault.ownerEmail || local.ownerEmail,
        sharedWith: vault.sharedWith,
        transferredFrom: vault.transferredFrom,
        transferredTo: vault.transferredTo,
        transferredToName: vault.transferredToName,
        transferredFromName: vault.transferredFromName,
        status: vault.status || local.status,
      };
    }
    if (packClockIsSeedSmashed(local) && !aromaticsSourceCanRestore(vault)) {
      return {
        ...local,
        ownerEmail: vault.ownerEmail || local.ownerEmail,
        sharedWith: vault.sharedWith ?? local.sharedWith,
        transferredFrom: vault.transferredFrom ?? local.transferredFrom,
        transferredTo: vault.transferredTo ?? local.transferredTo,
        transferredToName: vault.transferredToName ?? local.transferredToName,
        transferredFromName: vault.transferredFromName ?? local.transferredFromName,
        status: vault.status || local.status,
      };
    }
    if (packClockIsSeedSmashed(vault) && !packClockIsSeedSmashed(local)) {
      return restorePackClock(vault, local);
    }
    if (aromaticsPackIsThinner(local, vault) && aromaticsSourceCanRestore(vault)) {
      return {
        ...restorePackClock(local, vault),
        ownerEmail: vault.ownerEmail || local.ownerEmail,
        sharedWith: vault.sharedWith,
        transferredFrom: vault.transferredFrom,
        transferredTo: vault.transferredTo,
        transferredToName: vault.transferredToName,
        transferredFromName: vault.transferredFromName,
        status: vault.status || local.status,
      };
    }
  } else if (packClockIsSeedSmashed(local) && !packClockIsSeedSmashed(vault)) {
    return {
      ...restorePackClock(local, vault),
      ownerEmail: vault.ownerEmail || local.ownerEmail,
      sharedWith: vault.sharedWith,
      transferredFrom: vault.transferredFrom,
      transferredTo: vault.transferredTo,
      transferredToName: vault.transferredToName,
      transferredFromName: vault.transferredFromName,
      status: vault.status || local.status,
    };
  } else if (packClockIsSeedSmashed(vault) && !packClockIsSeedSmashed(local)) {
    return restorePackClock(vault, local);
  }
  const vaultWouldSmash = decidePackWrite(vault, local);
  if (vaultWouldSmash.action === "keep-last-good" || vaultWouldSmash.action === "refuse") {
    return withVaultIdentity(local, vault);
  }
  const localWouldSmash = decidePackWrite(local, vault);
  if (localWouldSmash.action === "keep-last-good" || localWouldSmash.action === "refuse") {
    if (localWouldSmash.code === "stale") {
      return withVaultIdentity({ ...vault, packId: local.packId, key: local.key }, vault);
    }
    return withVaultIdentity(restorePackClock(local, vault), vault);
  }
  const vaultMoved =
    packWasTransferred(vault) ||
    Boolean(
      vault.ownerEmail &&
        local.ownerEmail &&
        vault.ownerEmail.trim().toLowerCase() !== local.ownerEmail.trim().toLowerCase(),
    );
  if (!packHasSheets(vault) && packHasSheets(local)) {
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
    crew: pickCrewForPack(newer, older),
    orgChart: newer.orgChart ?? older.orgChart,
    schedule: pickScheduleForPack(newer, older),
    jobMeta: pickJobMetaForPack(newer, older),
    activities: newer.activities ?? older.activities,
    equipment: pickEquipment(newer.equipment, older.equipment),
    otherCost: pickOtherCost(newer.otherCost, older.otherCost),
    subcontractor: pickSubcontractor(newer.subcontractor, older.subcontractor),
    fcr: pickFcr(newer.fcr, older.fcr),
    costReport: pickCostReport(newer.costReport, older.costReport),
    purchasing: pickPurchasing(newer.purchasing, older.purchasing),
    status: newer.status || older.status,
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
    status: pack.status,
    schedule: pack.schedule,
    crew: pack.crew,
    orgChart: pack.orgChart,
    jobMeta: pack.jobMeta,
    activities: pack.activities,
    equipment: pack.equipment,
    otherCost: pack.otherCost,
    subcontractor: pack.subcontractor,
    fcr: pack.fcr,
    costReport: pack.costReport,
    purchasing: pack.purchasing,
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
    status: resolveEstimateStatus(
      identity.status,
      packId,
      store as Storage,
      regularClientFromParts(identity.site, identity.client, catalogSites()),
    ),
    schedule: readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`) ?? undefined,
    crew: readStoreJson(store, `${CREW_STORE_PREFIX}${key}`) ?? undefined,
    orgChart: readStoreJson(store, `${ORG_CHART_STORE_PREFIX}${key}`) ?? undefined,
    jobMeta: readStoreJson(store, `${JOB_META_PREFIX}${key}`) ?? undefined,
    activities: readStoreJson(store, `${ACTIVITY_STORE_PREFIX}${key}`) ?? undefined,
    equipment: readStoreJson(store, `${EQUIPMENT_STORE_PREFIX}${key}`) ?? undefined,
    otherCost: readStoreJson(store, `${OTHER_COST_STORE_PREFIX}${key}`) ?? undefined,
    subcontractor: readStoreJson(store, `${SUB_STORE_PREFIX}${key}`) ?? undefined,
    fcr: readStoreJson(store, `${FCR_STORE_PREFIX}${key}`) ?? undefined,
    costReport: readStoreJson(store, `${COST_REPORT_STORE_PREFIX}${key}`) ?? undefined,
    purchasing: readStoreJson(store, `${PURCHASING_STORE_PREFIX}${key}`) ?? undefined,
  };
}

export function applyPackToStore(store: StorageLike, pack: EstimatePackSnapshot) {
  if (!isLocalPackId(pack.packId)) return;
  const existing = collectPack(store, pack.packId);
  const writeDecision = decidePackWrite(pack, existing);
  if (writeDecision.action === "refuse" && !existing) return;
  if ((writeDecision.action === "keep-last-good" || writeDecision.action === "refuse") && existing) {
    pack = restorePackClock(pack, existing);
  } else if (packClockIsSeedSmashed(pack) || packLooksCrossPackGrafted(pack)) {
    if (existing && !packLooksSmashed(existing) && (scheduleHasWork(existing.schedule) || aromaticsSourceCanRestore(existing))) {
      pack = restorePackClock(pack, existing);
    }
  }
  const fpBreak = incomingBreaksFingerprint(pack, readPackFingerprint(store, pack.packId));
  if (fpBreak && existing && !packLooksSmashed(existing)) {
    pack = restorePackClock(pack, existing);
  }
  const stillGrafted = packLooksCrossPackGrafted(pack);
  const existingHealthy = Boolean(existing && !packLooksSmashed(existing));
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
      status: pack.status,
    },
    store,
  );
  touchLocalPack(pack.packId, pack.updatedAt || Date.now(), store, pack.createdAt);
  const key = storageKeyForPack(pack.packId);
  if (pack.schedule != null) {
    const existingSchedule = readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`);
    const incomingDemo = packHasDemoSeedClock({ packId: pack.packId, title: pack.title, schedule: pack.schedule });
    const existingLive = scheduleHasWork(existingSchedule) && !packHasDemoSeedClock({ packId: pack.packId, title: pack.title, schedule: existingSchedule });
    if (incomingDemo && existingLive) {
      // Demo / 8-21 seed clock cannot collapse a live Job setup.
    } else if (stillGrafted && existingHealthy) {
      // Cross-pack Aromatics clock cannot overwrite this pack's Job setup.
    } else if (scheduleHasWork(pack.schedule) || !scheduleHasWork(existingSchedule)) {
      writeStoreJson(store, `${PHASE_STORE_PREFIX}${key}`, pack.schedule);
    }
  }
  if (pack.crew != null) {
    const existingCrew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
    if (!crewHasRows(pack.crew) && crewHasRows(existingCrew)) {
      // Empty vault crew cannot wipe a filled pack.
    } else if (stillGrafted && existingHealthy) {
      // Richer foreign crew cannot beat this pack's last-good calendar.
    } else if (crewHasCustomClock(pack.crew) || !crewHasCustomClock(existingCrew)) {
      writeStoreJson(store, `${CREW_STORE_PREFIX}${key}`, pack.crew);
    }
  }
  if (pack.orgChart != null) writeStoreJson(store, `${ORG_CHART_STORE_PREFIX}${key}`, pack.orgChart);
  if (pack.jobMeta != null) {
    if (packHasForeignAfeName(pack) && existing && !packHasForeignAfeName(existing)) {
      // Foreign AFE (e.g. P66 Rodeo U-250 on Boiler 17) cannot stamp this pack.
    } else {
      writeStoreJson(store, `${JOB_META_PREFIX}${key}`, pack.jobMeta);
    }
  }
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
  writeSheetIfRicher(store, `${COST_REPORT_STORE_PREFIX}${key}`, pack.costReport, costReportHasWork);
  writeSheetIfRicher(store, `${PURCHASING_STORE_PREFIX}${key}`, pack.purchasing, purchasingHasWork);
  rememberPackFingerprint(store, collectPack(store, pack.packId) || pack);
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
    status: row && "status" in row ? clampStatusForSite(parseEstimateStatus(row.status), site, client, catalogSites()) : undefined,
    schedule: row?.schedule,
      crew: row?.crew,
      orgChart: row?.orgChart,
      jobMeta: row?.jobMeta,
      activities: row?.activities,
      equipment: row?.equipment,
      otherCost: row?.otherCost,
      subcontractor: row?.subcontractor,
      fcr: row?.fcr,
      costReport: row?.costReport,
      purchasing: row?.purchasing,
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
