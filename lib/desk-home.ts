import { companyDeskLogoSrc } from "./companies.ts";

export const HOME_WORDMARK = "HIT SQUAD";
export const HOME_KICKER = "PROJECT CONTROLS";

export const COMPANY_DESK_DOOR = {
  href: "/jobs",
  key: "company",
  label: "Company desk",
  note: "Your companies, then site, then jobs",
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

/** Visible home doors. Company desk enters through the hero, not a bottom plant card. */
export const HOME_DOORS = [COMPANY_DESK_DOOR] as const;

export function companyDoorLogoSrc(companies: Array<{ logo?: string | null }> = []) {
  return companyDeskLogoSrc(companies);
}

export function homeDoorHrefs(doors = HOME_DOORS) {
  return doors.map((door) => door.href);
}

export function homeDoorLabels(doors = HOME_DOORS) {
  return doors.map((door) => door.label);
}
