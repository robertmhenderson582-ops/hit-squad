export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: "owner";
};

export type JobRecord = {
  id: string;
  ownerId: string;
  code: string;
  title: string;
  client: string;
  discipline: "mechanical" | "electrical" | "civil" | "hse";
  kind: "outage" | "t&m" | "estimate" | "hse";
  status: "OPEN" | "HOLD" | "CLOSED";
  window: string;
  workingFigure: string;
  hseNote: string;
};

export type DeskBoard = {
  jobs: JobRecord[];
  estimatesOpen: number;
  costTickets: number;
  hseOpen: number;
};
