import {
  SHAHAN_CRAFT_TITLES,
  SHAHAN_FOREMAN_TITLES,
  SHAHAN_GENERAL_FOREMAN_TITLES,
  SHAHAN_STAFF_TITLES,
  SHAHAN_SUPPORT_TITLES,
} from "./shahan-wood-river.ts";

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
    note: "Position is the duty. Billed as is the craft rate.",
    positions: SHAHAN_SUPPORT_TITLES,
  },
] as const;

export type CrewLaneId = (typeof CREW_LANES)[number]["id"];
