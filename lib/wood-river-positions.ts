/**
 * Wood River position catalog for Crew dropdowns.
 *
 * Titles came from Wood River COMP / Exhibit B-1 (and the short lists this
 * desk already saved). Titles only — this module must not include dollars,
 * wages, burden, or the B-1 workbook.
 */

import { EAST_COAST_CRAFTS, WEST_COAST_CRAFTS } from "./p66-ips-crafts.ts";

/** Supervision titles already sitting on saved Staff rows. */
const LEGACY_STAFF_TITLES = [
  "Superintendent General PF 01",
  "Superintendent",
  "General Superintendent",
  "Project Manager",
  "Project Controls",
  "Cost Analyst",
  "Analyst Cost 01",
  "Coordinator QA-QC 01",
  "Coordinator Safety 01",
] as const;

/**
 * Exhibit B-1 staff / GF & above wording. Keep these exact strings so the
 * picker matches the book Robert is estimating from.
 */
const WOOD_RIVER_B1_STAFF_TITLES = [
  "LEAD SITE 01",
  "LEAD SITE 02",
  "MANAGER, PROJECT 01",
  "MANAGER, PROJECT 02",
  "ENGINEER, PROJECT 01",
  "ENGINEER, PROJECT 02",
  "ENGINEER, FIELD 01",
  "ENGINEER, FIELD 02",
  "ANALYST, COST 01",
  "ANALYST, COST 02",
  "ANALYST, PROJECT CONTROLS 01",
  "ANALYST, PROJECT CONTROLS 02",
  "PLANNER ESTIMATOR 01",
  "PLANNER ESTIMATOR 02",
  "PLANNER SCHEDULER 01",
  "PLANNER SCHEDULER 02",
  "LEAD QA-QC 01",
  "LEAD QA-QC 02",
  "COORDINATOR QA-QC 1",
  "COORDINATOR QA-QC 2",
  "LEAD SAFETY 01",
  "LEAD SAFETY 02",
  "COORDINATOR SAFETY 01",
  "COORDINATOR SAFETY 02",
  "COORDINATOR SUBCONTRACT 01",
  "COORDINATOR SUBCONTRACT 02",
  "COORDINATOR MATERIAL 01",
  "COORDINATOR MATERIAL 02",
  "CLERK FIELD 01",
  "CLERK FIELD 02",
  "MANAGER OFFICE 01",
  "MANAGER OFFICE 02",
  "CLERK OFFICE 01",
  "CLERK OFFICE 02",
  "CLERK TIMEKEEPER 01",
  "CLERK TIMEKEEPER 02",
  "CLERK DOCUMENT 01",
  "CLERK DOCUMENT 02",
  "SUPERINTENDENT 01",
  "SUPERINTENDENT 02",
  "GENERAL SUPERINTENDENT 01",
  "GENERAL SUPERINTENDENT 02",
] as const;

const LEGACY_DIRECT_CRAFT_TITLES = [
  "Boilermaker Journeyman",
  "Boilermaker Helper",
  "Pipefitter Journeyman",
  "Pipefitter Helper",
  "Ironworker Journeyman",
  "Operator",
  "Laborer",
  "Millwright",
  "Electrician",
  "Welder",
  "Merit welder",
] as const;

/** p66-ips supervision names — those belong on Staff / GF / Foreman cards. */
const IPS_SUPERVISION_TITLES = new Set([
  "General Superintendent",
  "Superintendent",
  "Project Manager",
  "Project Controls",
  "Safety",
  "General Foreman",
  "Foreman",
]);

export function uniqueSortedTitles(titles: readonly string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const title of titles) {
    const trimmed = title.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next.sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

function ipsCraftClassTitles(): string[] {
  return uniqueSortedTitles(
    [...EAST_COAST_CRAFTS, ...WEST_COAST_CRAFTS]
      .map((craft) => craft.name)
      .filter((name) => !IPS_SUPERVISION_TITLES.has(name)),
  );
}

export const WOOD_RIVER_STAFF_TITLES = uniqueSortedTitles([
  ...WOOD_RIVER_B1_STAFF_TITLES,
  ...LEGACY_STAFF_TITLES,
]);

export const WOOD_RIVER_GENERAL_FOREMAN_TITLES = uniqueSortedTitles([
  "Boilermaker GF Union",
  "Pipefitter GF Union",
  "General Foreman",
  "GENERAL FOREMAN 01",
  "GENERAL FOREMAN 02",
]);

export const WOOD_RIVER_FOREMAN_TITLES = uniqueSortedTitles([
  "Boilermaker Foreman",
  "Pipefitter Foreman",
  "Laborer Foreman 3-9",
  "Operator Foreman Gr XII",
  "Laydown Pipefitter Foreman",
  "Foreman",
  "FOREMAN 01",
  "FOREMAN 02",
]);

export const WOOD_RIVER_CRAFT_TITLES = uniqueSortedTitles([
  ...LEGACY_DIRECT_CRAFT_TITLES,
  ...ipsCraftClassTitles(),
]);

/** Duties already sitting on saved Support rows, plus IPS watch spellings. */
const LEGACY_SUPPORT_DUTIES = [
  "Tool Room Attendant",
  "Fire Watch",
  "Hole Watch",
  "Safety Attendant",
  "Material Handler",
] as const;

export const WOOD_RIVER_SUPPORT_TITLES = uniqueSortedTitles([
  ...LEGACY_SUPPORT_DUTIES,
  "Firewatch",
  "Holewatch",
]);
