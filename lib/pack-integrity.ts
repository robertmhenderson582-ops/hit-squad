/**
 * Program-wide estimate pack integrity.
 * Empty / identity-only / demo-clock / thinner / cross-pack / stale smash cannot overwrite a fuller live pack.
 * Drive vault is canonical for shared packs: every seat must see the same Estimate Total and
 * crew/clock after a hard-refresh. One user's smashed local cannot poison everyone else's view.
 * Locked baselines are official facts only — no invented Monroe $ or Boiler labor $.
 * U110 / U250 / Monroe have no vault JSON yet — identity-only reserved slots, do not invent files.
 */

import {
  AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS,
  AROMATICS_FREEZE_PROJECT_START,
  aromaticsPackLooksSmashed,
  aromaticsSourceCanRestore,
  crewClockSpanDays,
  crewRangesAreCollapsedStubs,
  isAromaticsIdentity,
} from "./aromatics-freeze.ts";
import { isBoiler17Identity } from "./boiler-17.ts";
import {
  isDefaultSeedSchedule,
  scheduleIsDemoSeedClock,
  scheduleProjectStart,
} from "./phase-schedule.ts";
import fixtures from "./wake-golden/fixtures.json" with { type: "json" };

/** Official ids only — do not import his-wood-river / wake-golden (circular with estimate-pack). */
const HIS_AROMATICS_PACK_ID = "new-mtj7bvtk-akmei";
const HIS_CAT2_PACK_ID = "new-mtaajdwa-f7539";
const RODEO_U110_PACK_ID = "new-u11026-rodeo";
const RODEO_U250_PACK_ID = "new-u25026-rodeo";
const MONROE_541V_PACK_ID = "new-541v26-monroe";
const BOILER17_PACK_ID = "new-b1726";
const WAKE_PACK_IDS = [RODEO_U110_PACK_ID, RODEO_U250_PACK_ID, MONROE_541V_PACK_ID];
const GOLDEN_MONEY_TOLERANCE = 0.5;

const CREW_LANES = ["staff", "generalForeman", "foreman", "direct", "support"] as const;

/** Sep 2 freeze Estimate Total. Do not invent a second Aromatics dollar lock. */
export const AROMATICS_FREEZE_GRAND_TOTAL = 25_324_671.97;

/** Sep 2 freeze Labor $ — live Cat 2 smash copied this onto the pit-stop pack. */
export const AROMATICS_FREEZE_LABOR = 19_063_808.52;

/** Sep 7 good Madison CAT 2 Estimate Total (vault fixture). Live smash was ~$20.81M. */
export const CAT2_SEP7_GRAND_TOTAL = 1_435_365.66;

/** Boiler leftover smashed onto the 8/21 demo seed — official B-1 starts 2026-08-10. */
export const BOILER17_DEMO_PROJECT_START = "2026-08-21";

/** Existing ≥ this many bytes + incoming under the thin ratio is a wipe (Boiler 150KB → 19.5KB). */
export const PACK_THICK_BYTES_FLOOR = 20_000;
export const PACK_THIN_BYTE_RATIO = 0.4;

export const INTEGRITY_FP_PREFIX = "hs.integrity.fp.";
export const PACK_INTEGRITY_ERROR_PREFIX = "PACK_INTEGRITY:";

export type IntegrityPack = {
  packId?: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
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

export type PackDollarsStatus = "locked" | "formula-unavailable" | "structure-only";

export type PackFamily = "aromatics" | "cat2" | "u110" | "u250" | "monroe" | "boiler";

export type PackBaseline = {
  packId: string;
  label: string;
  projectStart?: string;
  minCrewSpanDays?: number;
  grandTotal?: number;
  totalHours?: number;
  dollarsStatus: PackDollarsStatus;
  note: string;
};

export type PackRichness = {
  bytes: number;
  crewRows: number;
  crewSpanDays: number;
  sheetScore: number;
  identityOnly: boolean;
  emptyCrew: boolean;
  demoClock: boolean;
  collapsedStubs: boolean;
  hasLiveClock: boolean;
  hasSheets: boolean;
};

export type IntegrityDecision =
  | { action: "accept" }
  | { action: "refuse"; reason: string; code: string }
  | { action: "keep-last-good"; reason: string; code: string };

export type PackFingerprint = {
  packId: string;
  bytes: number;
  crewRows: number;
  crewSpanDays: number;
  sheetScore: number;
  projectStart: string;
  hasLiveClock: boolean;
  hasSheets: boolean;
  updatedAt: number;
};

export type BaselineCheck = {
  ok: boolean;
  fault?: string;
  skipped?: "identity-only" | "dollars-unavailable" | "structure-only";
  reason?: string;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayLen(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function titleKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function crewLaneRowCount(crew: unknown) {
  const row = asRecord(crew);
  if (!row) return 0;
  return CREW_LANES.reduce((sum, lane) => sum + arrayLen(row[lane]), 0);
}

export function packCrewHasRows(crew: unknown) {
  return crewLaneRowCount(crew) > 0;
}

function travelHasMoney(travel: unknown) {
  if (!Array.isArray(travel)) return false;
  return travel.some((line) => {
    const item = asRecord(line);
    if (!item) return false;
    return (Number(item.travelers) || 0) > 0 && (Number(item.miles) || 0) > 0 && (Number(item.perMile) || 0) > 0;
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

function sheetScoreOf(pack: IntegrityPack) {
  const other = asRecord(pack.otherCost);
  const equip = asRecord(pack.equipment);
  const sub = asRecord(pack.subcontractor);
  const fcr = asRecord(pack.fcr);
  const cost = asRecord(pack.costReport);
  const purchasing = asRecord(pack.purchasing);
  return (
    (packCrewHasRows(pack.crew) ? 1 : 0) +
    (equip && (arrayLen(equip.largeTools) || arrayLen(equip.thirdParty)) ? 1 : 0) +
    (other && (travelHasMoney(other.travel) || Number(other.perDiemRate) > 0 || miscHasMoney(other.misc)) ? 1 : 0) +
    (sub && (arrayLen(sub.lines) || arrayLen(sub.cards)) ? 1 : 0) +
    (fcr && (arrayLen(fcr.log) || arrayLen(fcr.rows) || arrayLen(fcr.logs) || arrayLen(fcr.lines)) ? 1 : 0) +
    (cost && (arrayLen(cost.snapshots) || Boolean(String(cost.notes || "").trim()) || arrayLen(cost.rows)) ? 1 : 0) +
    (purchasing && arrayLen(purchasing.lines) ? 1 : 0)
  );
}

export function packPayloadBytes(pack: IntegrityPack | null | undefined) {
  if (!pack) return 0;
  try {
    return JSON.stringify({
      schedule: pack.schedule ?? null,
      crew: pack.crew ?? null,
      orgChart: pack.orgChart ?? null,
      jobMeta: pack.jobMeta ?? null,
      activities: pack.activities ?? null,
      equipment: pack.equipment ?? null,
      otherCost: pack.otherCost ?? null,
      subcontractor: pack.subcontractor ?? null,
      fcr: pack.fcr ?? null,
      costReport: pack.costReport ?? null,
      purchasing: pack.purchasing ?? null,
    }).length;
  } catch {
    return 0;
  }
}

function moneyEqual(a: number, b: number, tol = GOLDEN_MONEY_TOLERANCE) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
}

function isWakeIdentityOnly(pack?: IntegrityPack | null) {
  if (!pack?.packId || !WAKE_PACK_IDS.includes(pack.packId.trim())) return false;
  return (pack.createdAt || 0) <= 1 && (pack.updatedAt || 0) <= 1;
}

export function isCat2Identity(pack?: { packId?: string; title?: string } | null) {
  if (!pack) return false;
  if ((pack.packId || "").trim() === HIS_CAT2_PACK_ID) return true;
  const title = titleKey(pack.title);
  return title.includes("madison cat 2") || title === "madison cat 2 (pit stop)";
}

export function packFamilyOf(pack?: { packId?: string; title?: string } | null): PackFamily | null {
  if (!pack) return null;
  const id = (pack.packId || "").trim();
  if (id === HIS_AROMATICS_PACK_ID || isAromaticsIdentity(pack)) return "aromatics";
  if (id === HIS_CAT2_PACK_ID || isCat2Identity(pack)) return "cat2";
  if (id === RODEO_U110_PACK_ID) return "u110";
  if (id === RODEO_U250_PACK_ID) return "u250";
  if (id === MONROE_541V_PACK_ID) return "monroe";
  if (id === BOILER17_PACK_ID || isBoiler17Identity(pack)) return "boiler";
  return null;
}

function jobMetaAfeName(jobMeta: unknown) {
  const row = asRecord(jobMeta);
  return typeof row?.afeName === "string" ? row.afeName : "";
}

/** Map a stamped AFE / job name onto a material family. Empty / unknown names are not grafts. */
export function afeFamilyOf(name = ""): PackFamily | null {
  const key = titleKey(name);
  if (!key) return null;
  if (key.includes("2027 aromatics") || key.includes("aromatics turnaround")) return "aromatics";
  if (key.includes("madison cat 2") || key.includes("cat 2 pit")) return "cat2";
  if (/\bu-?250\b/.test(key) || key.includes("p66 rodeo u-250") || key.includes("p66 rodeo u250")) return "u250";
  if (/\bu-?110\b/.test(key) || key.includes("p66 rodeo u-110") || key.includes("p66 rodeo u110")) return "u110";
  if (key.includes("541v") || key.includes("monroe")) return "monroe";
  if (key.includes("boiler 17")) return "boiler";
  return null;
}

function crewHasAromaticsFreezeStart(crew: unknown) {
  const row = asRecord(crew);
  if (!row) return false;
  for (const lane of CREW_LANES) {
    const list = row[lane];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const ranges = asRecord(item)?.ranges;
      if (!Array.isArray(ranges)) continue;
      for (const range of ranges) {
        const start = typeof asRecord(range)?.start === "string" ? String(asRecord(range)?.start) : "";
        if (start === AROMATICS_FREEZE_PROJECT_START || start.startsWith("2027-")) return true;
      }
    }
  }
  return false;
}

/** Multi-month 2027 Aromatics crew — the shape grafted onto live Cat 2. */
export function crewLooksLikeAromaticsFreeze(crew: unknown) {
  return crewClockSpanDays(crew) >= AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS && crewHasAromaticsFreezeStart(crew);
}

/**
 * Aromatics 2027-01-11 clock / multi-month 2027 crew sitting on a different pack.
 * Official Cat 2 never starts 2027-01-11. Other material packs need the long freeze crew
 * so a one-day 2027 stub on a draft (new-cat2pit) is not treated as smash.
 */
export function packHasAromaticsClockGraft(pack?: IntegrityPack | null) {
  if (!pack?.packId || isAromaticsIdentity(pack)) return false;
  const start = scheduleProjectStart(pack.schedule);
  const freezeCrew = crewLooksLikeAromaticsFreeze(pack.crew);
  if (isCat2Identity(pack) && (start === AROMATICS_FREEZE_PROJECT_START || freezeCrew)) return true;
  if (start === AROMATICS_FREEZE_PROJECT_START && freezeCrew) return true;
  if (freezeCrew && isMaterialPack(pack)) return true;
  return false;
}

export function packHasForeignAfeName(pack?: IntegrityPack | null) {
  if (!pack?.packId) return false;
  const family = packFamilyOf(pack);
  const afeFamily = afeFamilyOf(jobMetaAfeName(pack.jobMeta));
  if (!family || !afeFamily) return false;
  return family !== afeFamily;
}

/** Cross-pack overwrite: Aromatics crew/clock or another job's AFE stamped on this pack. */
export function packLooksCrossPackGrafted(pack?: IntegrityPack | null) {
  if (!pack?.packId) return false;
  if (packHasAromaticsClockGraft(pack)) return true;
  if (packHasForeignAfeName(pack)) return true;
  return false;
}

export function isMaterialPack(pack?: { packId?: string; title?: string } | null) {
  if (!pack) return false;
  const id = (pack.packId || "").trim();
  if (
    id === HIS_AROMATICS_PACK_ID ||
    id === HIS_CAT2_PACK_ID ||
    id === RODEO_U110_PACK_ID ||
    id === RODEO_U250_PACK_ID ||
    id === MONROE_541V_PACK_ID
  ) {
    return true;
  }
  return (
    isAromaticsIdentity(pack) ||
    isCat2Identity(pack) ||
    isBoiler17Identity(pack) ||
    Boolean(id && [RODEO_U110_PACK_ID, RODEO_U250_PACK_ID, MONROE_541V_PACK_ID].includes(id))
  );
}

export function isMaterialPackId(packId = "") {
  return isMaterialPack({ packId });
}

export function materialPackBaselines(): PackBaseline[] {
  return [
    {
      packId: HIS_AROMATICS_PACK_ID,
      label: "2027 Aromatics",
      projectStart: AROMATICS_FREEZE_PROJECT_START,
      minCrewSpanDays: AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS,
      grandTotal: AROMATICS_FREEZE_GRAND_TOTAL,
      dollarsStatus: "locked",
      note: "Sep 2 freeze Estimate Total. Clock 2027-01-11. Do not invent a second dollar lock.",
    },
    {
      packId: HIS_CAT2_PACK_ID,
      label: "Madison CAT 2",
      grandTotal: CAT2_SEP7_GRAND_TOTAL,
      dollarsStatus: "locked",
      note: "Sep 7 good Estimate Total. Live smash grafted Aromatics crew/clock (labor $19,063,808.52 → total ~$20.81M). Pit-stop dates may sit inside the 2026 seed window.",
    },
    {
      packId: RODEO_U110_PACK_ID,
      label: "Rodeo U110",
      grandTotal: fixtures.u110Contractor.buckets.grandTotal,
      totalHours: fixtures.u110Contractor.buckets.totalHours,
      dollarsStatus: "locked",
      note: `${fixtures.u110Contractor.note} No vault JSON yet — identity-only reserved slot.`,
    },
    {
      packId: RODEO_U250_PACK_ID,
      label: "Rodeo U250",
      grandTotal: fixtures.u250Contractor.buckets.grandTotal,
      totalHours: fixtures.u250Contractor.buckets.totalHours,
      dollarsStatus: "locked",
      note: `${fixtures.u250Contractor.note} No vault JSON yet — identity-only reserved slot.`,
    },
    {
      packId: MONROE_541V_PACK_ID,
      label: "Monroe 541V",
      totalHours: fixtures.monroe541v.monroeHours.totalLabor,
      dollarsStatus: "formula-unavailable",
      note: `${fixtures.monroe541v.note} No vault JSON yet — identity-only reserved slot.`,
    },
    {
      packId: BOILER17_PACK_ID,
      label: "Boiler 17",
      projectStart: "2026-08-10",
      totalHours: fixtures.boiler17B1.boiler17Hours.staffHours + fixtures.boiler17B1.boiler17Hours.targetCraftHours,
      dollarsStatus: "formula-unavailable",
      note: fixtures.boiler17B1.note,
    },
  ];
}

export function baselineForPack(pack?: { packId?: string; title?: string } | null) {
  if (!pack) return null;
  const id = (pack.packId || "").trim();
  return materialPackBaselines().find((row) => row.packId === id) ?? null;
}

/**
 * Demo / short seed clock that must not collapse a live schedule.
 * Cat 2 pit-stop dates can sit inside Aug–Oct 2026 — only the exact default seed is smash there.
 * Boiler leftover used projectStart 2026-08-21; official B-1 is 2026-08-10.
 */
export function packHasDemoSeedClock(pack?: IntegrityPack | null) {
  if (!pack) return false;
  if (isAromaticsIdentity(pack)) return scheduleIsDemoSeedClock(pack.schedule);
  if (isBoiler17Identity(pack)) {
    return isDefaultSeedSchedule(pack.schedule) || scheduleProjectStart(pack.schedule) === BOILER17_DEMO_PROJECT_START;
  }
  return isDefaultSeedSchedule(pack.schedule);
}

export function packIsIdentityOnly(pack?: IntegrityPack | null) {
  if (!pack?.packId) return true;
  if (isWakeIdentityOnly(pack)) return true;
  return sheetScoreOf(pack) === 0 && !packCrewHasRows(pack.crew) && !scheduleHasLiveClock(pack.schedule);
}

function scheduleHasLiveClock(schedule: unknown) {
  if (!schedule || isDefaultSeedSchedule(schedule)) return false;
  const start = scheduleProjectStart(schedule);
  if (start === BOILER17_DEMO_PROJECT_START) return false;
  const row = asRecord(schedule);
  const phases = Array.isArray(row?.phases) ? row.phases : [];
  return phases.some((phase) => {
    const item = asRecord(phase);
    return Boolean(item && (item.start || item.stop));
  });
}

export function packRichness(pack?: IntegrityPack | null): PackRichness {
  const crewRows = crewLaneRowCount(pack?.crew);
  const demoClock = packHasDemoSeedClock(pack);
  const hasLiveClock = Boolean(pack && !demoClock && scheduleHasLiveClock(pack.schedule));
  const sheetScore = pack ? sheetScoreOf(pack) : 0;
  return {
    bytes: packPayloadBytes(pack),
    crewRows,
    crewSpanDays: crewClockSpanDays(pack?.crew),
    sheetScore,
    identityOnly: packIsIdentityOnly(pack),
    emptyCrew: crewRows === 0,
    demoClock,
    collapsedStubs: crewRangesAreCollapsedStubs(pack?.crew),
    hasLiveClock,
    hasSheets: sheetScore > 0 || crewRows > 0 || hasLiveClock,
  };
}

export function packLooksSmashed(pack?: IntegrityPack | null) {
  if (!pack?.packId) return false;
  if (packLooksCrossPackGrafted(pack)) return true;
  if (isAromaticsIdentity(pack)) return aromaticsPackLooksSmashed(pack);
  if (isWakeIdentityOnly(pack)) return false;
  if (isBoiler17Identity(pack)) {
    return !packCrewHasRows(pack.crew) || packHasDemoSeedClock(pack);
  }
  if (packHasDemoSeedClock(pack) && packCrewHasRows(pack.crew) && crewClockSpanDays(pack.crew) <= 14) {
    const start = scheduleProjectStart(pack.schedule);
    if (start && start !== BOILER17_DEMO_PROJECT_START && !isDefaultSeedSchedule(pack.schedule)) return false;
    return isDefaultSeedSchedule(pack.schedule);
  }
  if (isMaterialPack(pack) && packHasDemoSeedClock(pack) && packCrewHasRows(pack.crew)) {
    return isDefaultSeedSchedule(pack.schedule);
  }
  if (isMaterialPack(pack) && !packCrewHasRows(pack.crew) && !isWakeIdentityOnly(pack) && !packIsIdentityOnly(pack)) {
    return packHasDemoSeedClock(pack);
  }
  return isDefaultSeedSchedule(pack.schedule) && packCrewHasRows(pack.crew) && !hasAnyRangeOutsideSeed(pack.crew);
}

function hasAnyRangeOutsideSeed(crew: unknown) {
  const row = asRecord(crew);
  if (!row) return false;
  for (const lane of CREW_LANES) {
    const list = row[lane];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const ranges = asRecord(item)?.ranges;
      if (!Array.isArray(ranges)) continue;
      for (const range of ranges) {
        const entry = asRecord(range);
        const start = typeof entry?.start === "string" ? entry.start : "";
        const end = typeof entry?.end === "string" ? entry.end : "";
        if ((start && (start < "2026-08-21" || start > "2026-10-05")) || (end && (end < "2026-08-21" || end > "2026-10-05"))) {
          return true;
        }
      }
    }
  }
  return false;
}

export function packStateLooksSmashed(packId: string, schedule: unknown, crew: unknown, title?: string) {
  return packLooksSmashed({ packId, title, schedule, crew });
}

function incomingIsThinner(incoming: PackRichness, existing: PackRichness) {
  if (existing.bytes >= PACK_THICK_BYTES_FLOOR && incoming.bytes < existing.bytes * PACK_THIN_BYTE_RATIO) return true;
  if (existing.crewRows > 0 && incoming.crewRows === 0) return true;
  if (existing.sheetScore > incoming.sheetScore && incoming.sheetScore === 0) return true;
  if (existing.crewSpanDays >= AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS && incoming.collapsedStubs) return true;
  return false;
}

export function decidePackWrite(
  incoming: IntegrityPack | null | undefined,
  existing: IntegrityPack | null | undefined,
): IntegrityDecision {
  if (!incoming?.packId) {
    return { action: "refuse", reason: "Missing package.", code: "missing" };
  }
  if (packLooksCrossPackGrafted(incoming) && !existing?.packId) {
    return {
      action: "refuse",
      reason: "Cross-pack crew, clock, or AFE cannot seed this estimate.",
      code: "cross-pack",
    };
  }
  if (!existing?.packId) return { action: "accept" };
  if ((existing.packId || "").trim() !== (incoming.packId || "").trim()) return { action: "accept" };

  const next = packRichness(incoming);
  const live = packRichness(existing);
  const incomingGraft = packLooksCrossPackGrafted(incoming);
  const existingGraft = packLooksCrossPackGrafted(existing);
  if (incomingGraft && !existingGraft) {
    if (live.hasSheets || live.crewRows > 0 || live.hasLiveClock) {
      return {
        action: "keep-last-good",
        reason: "Cross-pack crew, clock, or AFE cannot overwrite this estimate.",
        code: "cross-pack",
      };
    }
    return {
      action: "refuse",
      reason: "Cross-pack crew, clock, or AFE cannot seed this estimate.",
      code: "cross-pack",
    };
  }
  const aromaticsIncoming = isAromaticsIdentity(incoming) || isAromaticsIdentity(existing);

  if (aromaticsIncoming && aromaticsPackLooksSmashed(incoming) && aromaticsSourceCanRestore(existing)) {
    return {
      action: "keep-last-good",
      reason: "Demo or stub Aromatics clock cannot overwrite the Sep 2 freeze.",
      code: "demo-clock",
    };
  }

  if (next.identityOnly && live.hasSheets) {
    return {
      action: "keep-last-good",
      reason: "Identity-only card cannot overwrite a filled estimate.",
      code: "identity-only",
    };
  }

  if (next.emptyCrew && live.crewRows > 0) {
    return {
      action: "keep-last-good",
      reason: "Empty crew cannot overwrite a filled estimate.",
      code: "empty-crew",
    };
  }

  if (next.demoClock && live.hasLiveClock) {
    return {
      action: "keep-last-good",
      reason: "Demo seed clock cannot overwrite a live schedule.",
      code: "demo-clock",
    };
  }

  if (incomingIsThinner(next, live) && (next.identityOnly || next.emptyCrew || next.demoClock || next.collapsedStubs || !next.hasSheets)) {
    return {
      action: "keep-last-good",
      reason: "Thinner package cannot overwrite a fuller live estimate.",
      code: "thinner",
    };
  }

  if (isMaterialPack(incoming) && live.hasSheets && incomingIsThinner(next, live) && next.bytes < live.bytes * PACK_THIN_BYTE_RATIO) {
    return {
      action: "keep-last-good",
      reason: "Thinner package cannot overwrite a fuller live estimate.",
      code: "thinner",
    };
  }

  const incomingAt = incoming.updatedAt || 0;
  const existingAt = existing.updatedAt || 0;
  if (
    incomingAt > 0 &&
    existingAt > 0 &&
    incomingAt < existingAt &&
    packIsVaultCanonical(existing) &&
    packIsVaultCanonical(incoming) &&
    !packLooksSmashed(incoming) &&
    next.sheetScore <= live.sheetScore &&
    next.crewRows <= live.crewRows &&
    next.bytes <= live.bytes
  ) {
    return {
      action: "keep-last-good",
      reason: "Stale local copy cannot overwrite a newer vault estimate.",
      code: "stale",
    };
  }

  return { action: "accept" };
}

export function integrityErrorMessage(decision: IntegrityDecision) {
  if (decision.action === "accept") return "";
  return `${PACK_INTEGRITY_ERROR_PREFIX}${decision.reason}`;
}

/**
 * Healthy Drive copy — the shared source of truth after hard-refresh.
 * Smashed / identity-only / demo packs are never canonical.
 */
export function packIsVaultCanonical(pack?: IntegrityPack | null) {
  if (!pack?.packId) return false;
  if (packLooksSmashed(pack) || packLooksCrossPackGrafted(pack) || packIsIdentityOnly(pack)) return false;
  if (packHasDemoSeedClock(pack)) return false;
  return packRichness(pack).hasSheets;
}

/**
 * Do not PUT a smashed / thin / identity-only leftover back to Drive.
 * After a restore, a later local smash must not re-upload and poison other seats.
 */
export function shouldSkipIntegrityFlush(pack?: IntegrityPack | null) {
  if (!pack?.packId) return false;
  if (isWakeIdentityOnly(pack)) return true;
  if (packLooksSmashed(pack) || packLooksCrossPackGrafted(pack)) return true;
  if (isMaterialPackId(pack.packId) && packIsIdentityOnly(pack)) return true;
  if (isMaterialPackId(pack.packId) && !packCrewHasRows(pack.crew) && packHasDemoSeedClock(pack)) return true;
  return false;
}

export function fingerprintFromPack(pack: IntegrityPack): PackFingerprint {
  const rich = packRichness(pack);
  return {
    packId: pack.packId || "",
    bytes: rich.bytes,
    crewRows: rich.crewRows,
    crewSpanDays: rich.crewSpanDays,
    sheetScore: rich.sheetScore,
    projectStart: scheduleProjectStart(pack.schedule),
    hasLiveClock: rich.hasLiveClock,
    hasSheets: rich.hasSheets,
    updatedAt: pack.updatedAt || Date.now(),
  };
}

export function readPackFingerprint(store: StorageLike | null | undefined, packId: string): PackFingerprint | null {
  if (!store || !packId) return null;
  try {
    const raw = store.getItem(`${INTEGRITY_FP_PREFIX}${packId}`);
    if (!raw) return null;
    const row = JSON.parse(raw) as PackFingerprint;
    return row?.packId === packId ? row : null;
  } catch {
    return null;
  }
}

export function rememberPackFingerprint(store: StorageLike | null | undefined, pack: IntegrityPack) {
  if (!store || !pack.packId) return;
  if (packLooksSmashed(pack) || packIsIdentityOnly(pack) || !packRichness(pack).hasSheets) return;
  store.setItem(`${INTEGRITY_FP_PREFIX}${pack.packId}`, JSON.stringify(fingerprintFromPack(pack)));
}

export function incomingBreaksFingerprint(incoming: IntegrityPack, fp: PackFingerprint | null): string | null {
  if (!fp || fp.packId !== incoming.packId) return null;
  const next = packRichness(incoming);
  if (packLooksCrossPackGrafted(incoming) && (fp.hasSheets || fp.hasLiveClock || fp.crewRows > 0)) {
    return "Cross-pack crew, clock, or AFE cannot overwrite this estimate.";
  }
  if (next.identityOnly && fp.hasSheets) return "Identity-only card cannot overwrite a filled estimate.";
  if (next.emptyCrew && fp.crewRows > 0) return "Empty crew cannot overwrite a filled estimate.";
  if (next.demoClock && fp.hasLiveClock) return "Demo seed clock cannot overwrite a live schedule.";
  if (fp.bytes >= PACK_THICK_BYTES_FLOOR && next.bytes < fp.bytes * PACK_THIN_BYTE_RATIO) {
    return "Thinner package cannot overwrite a fuller live estimate.";
  }
  if (fp.crewSpanDays >= AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS && next.collapsedStubs) {
    return "Collapsed crew stubs cannot overwrite a multi-month schedule.";
  }
  return null;
}

export function checkPackBaseline(
  pack?: IntegrityPack | null,
  desk?: { grandTotal?: number; totalHours?: number } | null,
): BaselineCheck {
  if (!pack?.packId) return { ok: true, skipped: "identity-only", reason: "no pack" };
  const baseline = baselineForPack(pack);
  if (!baseline) return { ok: true, skipped: "identity-only", reason: "not a material pack" };
  if (packIsIdentityOnly(pack) || isWakeIdentityOnly(pack)) {
    return { ok: true, skipped: "identity-only", reason: "reserved slot — no invented totals" };
  }

  if (packLooksSmashed(pack) || packHasDemoSeedClock(pack)) {
    return {
      ok: false,
      fault: `${baseline.label} integrity fault: demo seed or empty smash vs locked ${baseline.label} baseline.`,
    };
  }

  if (baseline.projectStart) {
    const start = scheduleProjectStart(pack.schedule);
    if (start && start !== baseline.projectStart && packHasDemoSeedClock(pack)) {
      return { ok: false, fault: `${baseline.label} clock drifted from ${baseline.projectStart}.` };
    }
  }

  if (baseline.minCrewSpanDays && packCrewHasRows(pack.crew)) {
    const span = crewClockSpanDays(pack.crew);
    if (span > 0 && span < baseline.minCrewSpanDays) {
      return {
        ok: false,
        fault: `${baseline.label} crew span ${span}d is under the locked ${baseline.minCrewSpanDays}d floor.`,
      };
    }
  }

  if (baseline.dollarsStatus === "formula-unavailable") {
    if (desk?.totalHours != null && baseline.totalHours != null && !moneyEqual(desk.totalHours, baseline.totalHours, 1)) {
      return {
        ok: false,
        fault: `${baseline.label} hours ${desk.totalHours} ≠ locked ${baseline.totalHours} hrs.`,
      };
    }
    return { ok: true, skipped: "dollars-unavailable", reason: baseline.note };
  }

  if (baseline.dollarsStatus === "structure-only") {
    return { ok: true, skipped: "structure-only", reason: baseline.note };
  }

  if (
    isCat2Identity(pack) &&
    desk?.grandTotal != null &&
    (moneyEqual(desk.grandTotal, AROMATICS_FREEZE_LABOR) ||
      moneyEqual(desk.grandTotal, AROMATICS_FREEZE_GRAND_TOTAL) ||
      desk.grandTotal >= CAT2_SEP7_GRAND_TOTAL * 5)
  ) {
    return {
      ok: false,
      fault: `${baseline.label} desk $${desk.grandTotal} looks like an Aromatics graft vs locked $${baseline.grandTotal}.`,
    };
  }

  if (desk?.grandTotal != null && baseline.grandTotal != null) {
    if (!moneyEqual(desk.grandTotal, baseline.grandTotal, GOLDEN_MONEY_TOLERANCE)) {
      return {
        ok: false,
        fault: `${baseline.label} desk $${desk.grandTotal} ≠ locked $${baseline.grandTotal}.`,
      };
    }
  }
  if (desk?.totalHours != null && baseline.totalHours != null && !moneyEqual(desk.totalHours, baseline.totalHours, 1)) {
    return {
      ok: false,
      fault: `${baseline.label} hours ${desk.totalHours} ≠ locked ${baseline.totalHours} hrs.`,
    };
  }
  return { ok: true };
}

export function shouldHydrateOpenPack(packId = "") {
  return isMaterialPackId(packId);
}
