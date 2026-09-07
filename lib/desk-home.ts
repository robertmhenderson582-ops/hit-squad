import { companyDeskLogoSrc } from "./companies.ts";

export const HOME_WORDMARK = "HIT SQUAD";
export const HOME_KICKER = "PROJECT CONTROLS";

export const COMPANY_DESK_DOOR = {
  href: "/jobs",
  key: "company",
  label: "Company desk",
  note: "Your companies, then client, then site, then jobs",
} as const;

/** Buried on home — keep exported so the owner can unbury later. `/standalone` still works. */
export const STANDALONE_DOOR = {
  href: "/standalone",
  key: "standalone",
  label: "Standalone",
  note: "One-off estimate, change-order log, or a tool not tied to a client site",
} as const;

/** Ease-in bury: not a home door. Do not add back to HOME_DOORS without an owner ask. */
export const BURIED_HOME_DOORS = [STANDALONE_DOOR] as const;

/** Visible home doors. Jobs still enters the Client → Site → Jobs directory. */
export const HOME_DOORS = [COMPANY_DESK_DOOR] as const;

export type HomeDockTile = {
  href: string;
  key: string;
  label: string;
  note: string;
  rates?: boolean;
};

/**
 * Sample C lower-third dock. Live modules only — no dead doors, no combined Quality/HSE.
 * Jobs is the Client → Site → Jobs directory (PR 154/155).
 */
export const HOME_DOCK_TILES: readonly HomeDockTile[] = [
  { href: "/jobs", key: "jobs", label: "Jobs", note: "Client → Site → Jobs" },
  { href: "/rates", key: "rates", label: "Rates", note: "Wage books", rates: true },
  { href: "/cost", key: "cost", label: "Cost / PPR", note: "On-job cost report" },
  { href: "/change-orders", key: "change-orders", label: "Change orders", note: "ECR / FCR log" },
  { href: "/quality", key: "quality", label: "Quality", note: "Quality studio" },
  { href: "/hse", key: "hse", label: "HSE", note: "Site safety" },
  { href: "/purchasing", key: "purchasing", label: "Purchasing", note: "Tools and consumables" },
] as const;

const DEAD_HOME_DOORS = ["/standalone", "/accounting", "/payroll", "/team", "/scheduling", "/modules"] as const;

export function companyDoorLogoSrc(companies: Array<{ logo?: string | null }> = []) {
  return companyDeskLogoSrc(companies);
}

export function homeDoorHrefs(doors = HOME_DOORS) {
  return doors.map((door) => door.href);
}

export function homeDoorLabels(doors = HOME_DOORS) {
  return doors.map((door) => door.label);
}

export function homeDockTiles(canRates = true) {
  return HOME_DOCK_TILES.filter((tile) => !tile.rates || canRates);
}

export function homeDockHrefs(canRates = true) {
  return homeDockTiles(canRates).map((tile) => tile.href);
}

export function homeDockLabels(canRates = true) {
  return homeDockTiles(canRates).map((tile) => tile.label);
}

export function homeDockHasCombinedQualityHse(tiles = HOME_DOCK_TILES) {
  return tiles.some((tile) => /quality\s*\/\s*hse/i.test(`${tile.label} ${tile.note}`));
}

export function homeDockOmitsDeadDoors(tiles = HOME_DOCK_TILES) {
  return tiles.every((tile) => !DEAD_HOME_DOORS.includes(tile.href as (typeof DEAD_HOME_DOORS)[number]));
}
