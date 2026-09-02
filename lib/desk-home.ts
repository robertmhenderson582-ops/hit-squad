import { companyDeskLogoSrc } from "./companies.ts";

export const HOME_WORDMARK = "HIT SQUAD";
export const HOME_KICKER = "PROJECT CONTROLS";

export const HOME_DOORS = [
  {
    href: "/jobs",
    key: "company",
    label: "Company desk",
    note: "Your companies, then site, then jobs",
  },
  {
    href: "/standalone",
    key: "standalone",
    label: "Standalone",
    note: "One-off estimate, change-order log, or a tool not tied to a client site",
  },
] as const;

export function companyDoorLogoSrc(companies: Array<{ logo?: string | null }> = []) {
  return companyDeskLogoSrc(companies);
}

export function homeDoorHrefs(doors = HOME_DOORS) {
  return doors.map((door) => door.href);
}

export function homeDoorLabels(doors = HOME_DOORS) {
  return doors.map((door) => door.label);
}
