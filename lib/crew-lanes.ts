export const CREW_LANES = [
  {
    id: "staff",
    title: "Staff",
    note: "Supervision / GF & above",
    positions: [
      "Analyst Cost 01",
      "Cost Analyst",
      "Project Controls",
      "Superintendent",
      "Superintendent General PF 01",
      "General Superintendent",
      "Project Manager",
    ],
  },
  {
    id: "general-foreman",
    title: "General Foreman",
    note: "General Foreman sits on this card. It does not count as a working foreman.",
    positions: ["General Foreman"],
  },
  {
    id: "foreman",
    title: "Foreman",
    note: "Working foreman. General Foreman does not count as working foreman.",
    positions: ["Foreman"],
  },
  {
    id: "direct",
    title: "Direct Craft",
    note: "Craft positions. Add a position to start — nothing is prefilled.",
    positions: [
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
    ],
  },
  {
    id: "support",
    title: "Support",
    note: "Position is the duty. Billed as is the craft rate.",
    positions: [] as string[],
  },
] as const;

export type CrewLaneId = (typeof CREW_LANES)[number]["id"];
