import {
  WOOD_RIVER_CRAFT_TITLES,
  WOOD_RIVER_FOREMAN_TITLES,
  WOOD_RIVER_GENERAL_FOREMAN_TITLES,
  WOOD_RIVER_STAFF_TITLES,
  WOOD_RIVER_SUPPORT_TITLES,
} from "./wood-river-positions.ts";

export const CREW_LANES = [
  {
    id: "staff",
    title: "Staff",
    note: "Supervision / GF & above",
    positions: WOOD_RIVER_STAFF_TITLES,
  },
  {
    id: "general-foreman",
    title: "General Foreman",
    note: "General Foreman sits on this card. It does not count as a working foreman.",
    positions: WOOD_RIVER_GENERAL_FOREMAN_TITLES,
  },
  {
    id: "foreman",
    title: "Foreman",
    note: "Working foreman. General Foreman does not count as working foreman.",
    positions: WOOD_RIVER_FOREMAN_TITLES,
  },
  {
    id: "direct",
    title: "Direct Craft",
    note: "Craft positions. Add a position to start — nothing is prefilled.",
    positions: WOOD_RIVER_CRAFT_TITLES,
  },
  {
    id: "support",
    title: "Support",
    note: "Position is the duty. Billed as is the craft rate.",
    positions: WOOD_RIVER_SUPPORT_TITLES,
  },
] as const;

export type CrewLaneId = (typeof CREW_LANES)[number]["id"];
