import {
  SHAHAN_CRAFT_TITLES,
  SHAHAN_FOREMAN_TITLES,
  SHAHAN_GENERAL_FOREMAN_TITLES,
  SHAHAN_STAFF_TITLES,
  SHAHAN_SUPPORT_TITLES,
} from "./shahan-wood-river.ts";

/** Working Foreman first, then Direct Craft. No GF / Staff. Order kept so Foreman titles stay easy to find. */
export function supportBilledAsTitles(
  foreman: readonly string[] = SHAHAN_FOREMAN_TITLES,
  craft: readonly string[] = SHAHAN_CRAFT_TITLES,
): string[] {
  const blocked = new Set<string>([...SHAHAN_GENERAL_FOREMAN_TITLES, ...SHAHAN_STAFF_TITLES]);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const title of [...foreman, ...craft]) {
    const trimmed = title.trim();
    if (!trimmed || blocked.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

export const SUPPORT_BILLED_AS_TITLES = supportBilledAsTitles();

export const CREW_LANES = [
  {
    id: "staff",
    title: "Staff",
    note: "Supervision / coordinators / managers / clerks / GS / QA / Safety. Shahan TM OCIP titles.",
    positions: SHAHAN_STAFF_TITLES,
  },
  {
    id: "general-foreman",
    title: "General Foreman",
    note: "General Foreman sits on this card. It does not count as a working foreman.",
    positions: SHAHAN_GENERAL_FOREMAN_TITLES,
  },
  {
    id: "foreman",
    title: "Foreman",
    note: "Working foreman. General Foreman does not count as working foreman.",
    positions: SHAHAN_FOREMAN_TITLES,
  },
  {
    id: "direct",
    title: "Direct Craft",
    note: "Craft positions. Add a position to start — nothing is prefilled.",
    positions: SHAHAN_CRAFT_TITLES,
  },
  {
    id: "support",
    title: "Support",
    note: "Position is the duty. Billed as is the craft or working-foreman rate. Direct Craft and Foreman cards stay their own cards.",
    positions: SHAHAN_SUPPORT_TITLES,
  },
] as const;

export type CrewLaneId = (typeof CREW_LANES)[number]["id"];
