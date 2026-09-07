/**
 * Wood River Boiler 17 — awarded Regular job.
 * Official RH B-1 locks hours from Drive text. Labor $ formulas were #REF —
 * do not invent a desk grand total from that book.
 * Cost / PPR wires to Mike CPPR JN 108451 May lock (owner facts).
 * Excel binaries stay in Drive / Gmail. Never commit them.
 */

import { clampEstimateStatus, parseEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import {
  OFFICIAL_BOILER17_B1_REVISION_ID,
  OFFICIAL_BOILER17_B1_REVISION_NAME,
} from "./work-folder.ts";

export const BOILER17_PACK_ID = "new-b1726";
export const BOILER17_JOB_CODE = "EST-B1726";
export const BOILER17_TITLE = "Boiler 17 2026";
export const BOILER17_CLIENT = "Phillips 66";
export const BOILER17_SITE = "Wood River — Roxana, IL";
export const BOILER17_SITE_ID = "site-madison";
export const BOILER17_WINDOW = "2026";
export const BOILER17_STATUS: EstimateStatus = "Locked";
export const BOILER17_JOB_NUMBER = "108451";

export const MIKE_CPPR_108451_FILE =
  "Madison_CPPR_108451_P66 WR_Boiler 17_05.30.26.rev.xxx.xls";
export const MIKE_CPPR_108451_STATUS_DATE = "2026-05-30";
/** Owner lock — May Labor + PD + Travel. */
export const MIKE_CPPR_108451_MAY_LABOR_PD_TRAVEL = 191_802;
/** Owner lock — May including 3rd party + COE. */
export const MIKE_CPPR_108451_MAY_WITH_THIRD_COE = 225_256;

export const BOILER17_COST_NOTE =
  "Mike CPPR 108451 May lock — Labor+PD+Travel $191,802; w/ 3rd+COE $225,256. Turnip 15/16 paste is the ingest. Not the B-1 estimate total.";

function normId(value = "") {
  return value.trim().toLowerCase();
}

function titleKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isBoiler17PackId(packId = "") {
  return normId(packId) === normId(BOILER17_PACK_ID);
}

export function isBoiler17Identity(pack?: { packId?: string; title?: string; code?: string } | null) {
  if (!pack) return false;
  if (isBoiler17PackId(pack.packId)) return true;
  const code = (pack.code || "").trim().toUpperCase();
  if (code === BOILER17_JOB_CODE) return true;
  const title = titleKey(pack.title);
  return Boolean(title && (title === titleKey(BOILER17_TITLE) || /\bboiler\s*17\b/.test(title)));
}

export function defaultStatusForBoiler17(
  packId = "",
  current?: EstimateStatus | string | null,
  regularClient = true,
): EstimateStatus | undefined {
  if (!isBoiler17PackId(packId) && !isBoiler17Identity({ packId })) return undefined;
  if (current != null && String(current).trim() !== "") {
    return clampEstimateStatus(parseEstimateStatus(current), regularClient);
  }
  return clampEstimateStatus(BOILER17_STATUS, regularClient);
}

export function jobNumberForPack(
  pack?: { packId?: string; title?: string; jobNumber?: string } | null,
  jobMeta?: { jobNumber?: string } | null,
) {
  const typed = (jobMeta?.jobNumber || pack?.jobNumber || "").trim();
  if (typed) return typed;
  if (isBoiler17Identity(pack)) return BOILER17_JOB_NUMBER;
  return "";
}

export function boiler17WorkingFigure(pack?: { status?: string; packId?: string; title?: string } | null) {
  if (!isBoiler17Identity(pack)) return "";
  const status = defaultStatusForBoiler17(pack?.packId, pack?.status) || BOILER17_STATUS;
  return `JN ${BOILER17_JOB_NUMBER} · ${status}`;
}

export function boiler17OfficialRevision() {
  return {
    id: OFFICIAL_BOILER17_B1_REVISION_ID,
    name: OFFICIAL_BOILER17_B1_REVISION_NAME,
  };
}

export function checkMikeCppr108451(book?: { notes?: string; statusDate?: string } | null): {
  ok: boolean;
  reason?: string;
} {
  if (!book) return { ok: false, reason: "missing cost report" };
  const notes = book.notes || "";
  if (!notes.includes(BOILER17_JOB_NUMBER)) {
    return { ok: false, reason: "cost notes missing JN 108451" };
  }
  if (!notes.includes("191,802") && !notes.includes("191802")) {
    return { ok: false, reason: "cost notes missing May Labor+PD+Travel $191,802" };
  }
  if (!notes.includes("225,256") && !notes.includes("225256")) {
    return { ok: false, reason: "cost notes missing May w/ 3rd+COE $225,256" };
  }
  if (book.statusDate && book.statusDate !== MIKE_CPPR_108451_STATUS_DATE) {
    return { ok: false, reason: `status date ${book.statusDate} ≠ ${MIKE_CPPR_108451_STATUS_DATE}` };
  }
  return { ok: true };
}
