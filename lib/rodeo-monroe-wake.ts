/**
 * Rodeo U110 / U250 + Monroe 541V job shells.
 * Identity + Work Folder / official-revision pointers only.
 * One reserved live-pack slot per job. Do not invent crew calendars or totals.
 * If a live pack already exists for that slot, wire it — never duplicate.
 */

import { assignedCompanyId, companyScopeFor, type CompanyScope } from "./companies.ts";
import { isOwnerIdentity } from "./identity.ts";
import { jobCodeFromPackId } from "./his-wood-river.ts";
import type { LocalPack } from "./local-estimates.ts";
import {
  OFFICIAL_MONROE_541V_REVISION_ID,
  OFFICIAL_MONROE_541V_REVISION_NAME,
  OFFICIAL_U110_REVISION_ID,
  OFFICIAL_U110_REVISION_NAME,
  OFFICIAL_U250_REVISION_ID,
  OFFICIAL_U250_REVISION_NAME,
  RODEO_WORKBOOK_U110_ID,
  RODEO_WORKBOOK_U250_ID,
  WORK_FOLDER_MONROE_541V_ID,
  WORK_FOLDER_U110_TA_ID,
  WORK_FOLDER_U250_FALL_ID,
} from "./work-folder.ts";

export const RODEO_U110_PACK_ID = "new-u11026-rodeo";
export const RODEO_U250_PACK_ID = "new-u25026-rodeo";
export const MONROE_541V_PACK_ID = "new-541v26-monroe";

export const RODEO_U110_JOB_CODE = "EST-U11026";
export const RODEO_U250_JOB_CODE = "EST-U25026";
export const MONROE_541V_JOB_CODE = "EST-541V26";

export type WakeTemplateFamily =
  | "madison-contractor"
  | "p66-rodeo-workbook"
  | "client-estimate-form"
  | "monroe-workbook"
  | "wood-river-b1"
  | "ferndale-gep";

export type WakeJobShell = {
  packId: string;
  jobCode: string;
  title: string;
  client: string;
  site: string;
  siteId: string;
  plantSlug: string;
  unit: string;
  window: string;
  /** Official Gmail revision that locks filled totals. */
  officialRevisionId: string;
  officialRevisionName: string;
  workFolderId: string;
  /** Additional client face — never collapsed into the official lock. */
  extraTemplateIds: string[];
  families: WakeTemplateFamily[];
};

/** Rodeo keeps both faces. Official lock is family A; workbook is family B. */
export const RODEO_U110_SHELL: WakeJobShell = {
  packId: RODEO_U110_PACK_ID,
  jobCode: RODEO_U110_JOB_CODE,
  title: "Rodeo U110 2026 TA",
  client: "Phillips 66",
  site: "Rodeo — Rodeo, CA",
  siteId: "site-rodeo",
  plantSlug: "rodeo",
  unit: "U110",
  window: "2026 TA",
  officialRevisionId: OFFICIAL_U110_REVISION_ID,
  officialRevisionName: OFFICIAL_U110_REVISION_NAME,
  workFolderId: WORK_FOLDER_U110_TA_ID,
  extraTemplateIds: [RODEO_WORKBOOK_U110_ID],
  families: ["madison-contractor", "p66-rodeo-workbook"],
};

export const RODEO_U250_SHELL: WakeJobShell = {
  packId: RODEO_U250_PACK_ID,
  jobCode: RODEO_U250_JOB_CODE,
  title: "Rodeo U250 Fall 2026",
  client: "Phillips 66",
  site: "Rodeo — Rodeo, CA",
  siteId: "site-rodeo",
  plantSlug: "rodeo",
  unit: "U250",
  window: "Fall 2026",
  officialRevisionId: OFFICIAL_U250_REVISION_ID,
  officialRevisionName: OFFICIAL_U250_REVISION_NAME,
  workFolderId: WORK_FOLDER_U250_FALL_ID,
  extraTemplateIds: [RODEO_WORKBOOK_U250_ID],
  families: ["madison-contractor", "p66-rodeo-workbook"],
};

export const MONROE_541V_SHELL: WakeJobShell = {
  packId: MONROE_541V_PACK_ID,
  jobCode: MONROE_541V_JOB_CODE,
  title: "Monroe 541V",
  client: "Monroe Energy",
  site: "Monroe Energy — Trainer, PA",
  siteId: "site-monroe",
  plantSlug: "monroe-energy",
  unit: "541V",
  window: "541V estimate",
  officialRevisionId: OFFICIAL_MONROE_541V_REVISION_ID,
  officialRevisionName: OFFICIAL_MONROE_541V_REVISION_NAME,
  workFolderId: WORK_FOLDER_MONROE_541V_ID,
  extraTemplateIds: [],
  families: ["monroe-workbook"],
};

export const RODEO_MONROE_WAKE_SHELLS: WakeJobShell[] = [RODEO_U110_SHELL, RODEO_U250_SHELL, MONROE_541V_SHELL];

function normId(value = "") {
  return value.trim().toLowerCase();
}

function titleKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function wakeShells(): WakeJobShell[] {
  return RODEO_MONROE_WAKE_SHELLS;
}

export function wakeShellByPackId(packId = "") {
  const id = normId(packId);
  if (!id) return null;
  return wakeShells().find((row) => normId(row.packId) === id) ?? null;
}

/** Job-tree hrefs often pass a packId-only hint. Match by id/code first; title/site are optional. */
export type WakePackHint = Pick<LocalPack, "packId"> &
  Partial<Pick<LocalPack, "title" | "siteId" | "site" | "createdAt" | "updatedAt">>;

export function wakeMatchForPack(pack?: WakePackHint | null) {
  if (!pack) return null;
  const byId = wakeShellByPackId(pack.packId);
  if (byId) return byId;
  const code = jobCodeFromPackId(pack.packId);
  const byCode = wakeShells().find((row) => row.jobCode === code);
  if (byCode) return byCode;
  const title = titleKey(pack.title);
  if (!title) return null;
  return wakeShells().find((row) => titleKey(row.title) === title) ?? null;
}

export function isRodeoMonroeWakePack(pack?: WakePackHint | null) {
  return Boolean(wakeMatchForPack(pack));
}

/** Identity-only card (createdAt/updatedAt ≤ 1). A later vault write is the live pack. */
export function isWakeIdentityOnly(pack?: WakePackHint | null) {
  if (!wakeMatchForPack(pack)) return false;
  return (pack?.createdAt || 0) <= 1 && (pack?.updatedAt || 0) <= 1;
}

export function shouldPaintWakeCards(
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  if (!user?.email && !scope) return false;
  if (user?.role === "owner" || isOwnerIdentity(user?.email)) return true;
  const next = scope ?? companyScopeFor(user);
  return assignedCompanyId(next) === "madison";
}

function cardFromShell(row: WakeJobShell): LocalPack {
  return {
    packId: row.packId,
    key: `new:${row.packId}`,
    title: row.title,
    client: row.client,
    site: row.site,
    siteId: row.siteId,
    createdAt: 1,
    updatedAt: 1,
  };
}

export function rodeoMonroeWakeCards(): LocalPack[] {
  return wakeShells().map(cardFromShell);
}

function wakeCardPresent(packs: LocalPack[], card: LocalPack) {
  return packs.some((row) => {
    if (normId(row.packId) === normId(card.packId)) return true;
    const match = wakeMatchForPack(row);
    return Boolean(match && normId(match.packId) === normId(card.packId));
  });
}

/** Identity cards only when that job is not already on the desk. Never remaps a live pack. */
export function mergeRodeoMonroeWakeCards(packs: LocalPack[]): LocalPack[] {
  const extras = rodeoMonroeWakeCards().filter((card) => !wakeCardPresent(packs, card));
  return [...packs, ...extras];
}

export function oneLivePackPerWakeJob(packs: LocalPack[]) {
  const seen = new Set<string>();
  for (const pack of packs) {
    const shell = wakeMatchForPack(pack);
    if (!shell) continue;
    if (seen.has(shell.packId)) return false;
    seen.add(shell.packId);
  }
  return true;
}
