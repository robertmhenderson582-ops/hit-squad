import { companyDeskLogoSrc } from "./companies.ts";
import { canSeeRateVaultDoor } from "./desk-role.ts";
import { isRateVaultOnlyViewer } from "./rate-vault.ts";

export const HOME_WORDMARK = "HIT SQUAD";
export const HOME_KICKER = "PROJECT CONTROLS";

export const COMPANY_DESK_DOOR = {
  href: "/jobs",
  key: "company",
  label: "Company desk",
  note: "Your companies, then division, then client, then site, then jobs",
} as const;

/** Buried on home — keep exported so the owner can unbury later. `/standalone` still works. */
export const STANDALONE_DOOR = {
  href: "/standalone",
  key: "standalone",
  label: "Standalone",
  note: "One-off estimate, change-order log, or a tool not tied to a client site",
} as const;

/**
 * Parked HUD rollup. Not a Home door until real feeds exist.
 * Do not invent Scoreboard metrics. Do not add to HOME_DOCK_TILES without an owner ask.
 */
export const SCOREBOARD_DOOR = {
  href: "/scoreboard",
  key: "scoreboard",
  label: "Scoreboard",
  note: "Read-only rollup — parked until live feeds",
} as const;

/**
 * Owner-eyes-only Home door. Not a public HOME_DOCK_TILES peer.
 * HomeDock appends it only when session + lens hold `rate-vault`.
 */
export const RATE_VAULT_DOOR = {
  href: "/rate-vault",
  key: "rate-vault",
  label: "Rate Vault",
  note: "Private B-1 workshop",
} as const;

/** Ease-in bury: not a home door. Do not add back to HOME_DOORS without an owner ask. */
export const BURIED_HOME_DOORS = [STANDALONE_DOOR] as const;

/** Visible home doors. Jobs still enters the Company → Division → Client → Site → Job directory. */
export const HOME_DOORS = [COMPANY_DESK_DOOR] as const;

export type HomeDockTile = {
  href: string;
  key: string;
  label: string;
  note: string;
  rates?: boolean;
};

/**
 * Locked Home doors (Robert 2026-09-08): Jobs · Quality · HSE · Accounting.
 * Sample A corner cards + HUD A BrandMark stay. No invented Scoreboard feeds.
 */
export const HOME_DOCK_TILES: readonly HomeDockTile[] = [
  { href: "/jobs", key: "jobs", label: "Jobs", note: "Company → Division → Client → Site → Job" },
  { href: "/quality", key: "quality", label: "Quality", note: "Quality studio" },
  { href: "/hse", key: "hse", label: "HSE", note: "Site safety" },
  { href: "/accounting", key: "accounting", label: "Accounting", note: "Not open for trial" },
] as const;

/**
 * Job-scoped tools. Not Home peers — open from Jobs / an estimate tab.
 * Progressive disclosure: Nathan still reaches Rates from Jobs or Wage lookup.
 */
export const JOB_SCOPED_TILES: readonly HomeDockTile[] = [
  { href: "/rates", key: "rates", label: "Rates", note: "Wage books", rates: true },
  { href: "/cost", key: "cost", label: "Cost / PPR", note: "On-job cost report" },
  { href: "/change-orders", key: "change-orders", label: "Change orders", note: "ECR / FCR log" },
  { href: "/purchasing", key: "purchasing", label: "Purchasing", note: "Tools and consumables" },
] as const;

const DEAD_HOME_DOORS = ["/standalone", "/payroll", "/team", "/scheduling", "/modules", "/scoreboard", "/inbox", "/tickets"] as const;
const BURIED_JOB_HREFS = new Set(JOB_SCOPED_TILES.map((tile) => tile.href));

export function companyDoorLogoSrc(companies: Array<{ logo?: string | null }> = []) {
  return companyDeskLogoSrc(companies);
}

export function homeDoorHrefs(doors = HOME_DOORS) {
  return doors.map((door) => door.href);
}

export function homeDoorLabels(doors = HOME_DOORS) {
  return doors.map((door) => door.label);
}

export function homeDockTiles(_canRates = true) {
  return HOME_DOCK_TILES.slice();
}

type RateVaultViewer = { role?: string; privileges?: readonly string[] | null };

/** Public four doors, plus Rate Vault when the session and lens both hold the grant.
 *  A Rate Vault–only lens (James, or View as James) hides Jobs / Quality / HSE / Accounting. */
export function homeDockTilesForViewer(
  session?: (RateVaultViewer & { email?: string }) | null,
  lens?: (RateVaultViewer & { email?: string }) | null,
  canRates = true,
) {
  if (isRateVaultOnlyViewer(lens ?? session)) {
    return canSeeRateVaultDoor(session, lens) ? [RATE_VAULT_DOOR] : [];
  }
  const tiles: HomeDockTile[] = homeDockTiles(canRates);
  if (canSeeRateVaultDoor(session, lens)) tiles.push(RATE_VAULT_DOOR);
  return tiles;
}

export function homeDockHrefs(canRates = true) {
  return homeDockTiles(canRates).map((tile) => tile.href);
}

export function homeDockLabels(canRates = true) {
  return homeDockTiles(canRates).map((tile) => tile.label);
}

export function jobScopedTiles(canRates = true) {
  return JOB_SCOPED_TILES.filter((tile) => !tile.rates || canRates);
}

export function jobScopedHrefs(canRates = true) {
  return jobScopedTiles(canRates).map((tile) => tile.href);
}

export function jobScopedLabels(canRates = true) {
  return jobScopedTiles(canRates).map((tile) => tile.label);
}

export function homeDockHasCombinedQualityHse(tiles = HOME_DOCK_TILES) {
  return tiles.some((tile) => /quality\s*\/\s*hse/i.test(`${tile.label} ${tile.note}`));
}

export function homeDockOmitsDeadDoors(tiles = HOME_DOCK_TILES) {
  return tiles.every((tile) => !DEAD_HOME_DOORS.includes(tile.href as (typeof DEAD_HOME_DOORS)[number]));
}

export function homeDockOmitsJobScopedPeers(tiles = HOME_DOCK_TILES) {
  return tiles.every((tile) => !BURIED_JOB_HREFS.has(tile.href));
}
