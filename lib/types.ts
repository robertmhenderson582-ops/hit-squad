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

export type SiteRecord = {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  client: string;
  plant: string;
  units: string[];
  state: string;
  turnaround: string;
  contract: string;
  gate: string;
  notes: string;
};

export type EstimateRecord = {
  id: string;
  ownerId: string;
  siteId: string;
  code: string;
  title: string;
  client: string;
  unit: string;
  type: "Lump sum" | "T&M" | "Hybrid";
  status: "DRAFT" | "WORKING" | "ISSUED" | "HOLD";
  window: string;
  labor: string;
  material: string;
  total: string;
  estimator: string;
  revision: string;
};

export type CrewLine = {
  id: string;
  estimateId: string;
  craft: string;
  headcount: number;
  shift: string;
  hours: number;
  baseRate: number;
  burdenedRate: number;
};

export type ActivityLine = {
  id: string;
  estimateId: string;
  wbs: string;
  name: string;
  craft: string;
  mh: number;
  dollars: string;
  status: "PLANNED" | "IN PROGRESS" | "HOLD";
};

export type ChangeOrderRecord = {
  id: string;
  ownerId: string;
  number: string;
  estimateCode: string;
  title: string;
  origin: "Ops" | "Engineering" | "HSE" | "Contractor";
  status: "OPEN" | "SUBMITTED" | "APPROVED" | "HOLD";
  laborDelta: string;
  materialDelta: string;
  schedule: string;
  filed: string;
};

export type RateLine = {
  id: string;
  ownerId: string;
  craft: string;
  state: string;
  base: number;
  fica: number;
  fui: number;
  sui: number;
  wc: number;
  gl: number;
  smallTools: number;
  burdened: number;
};

export type HseRecord = {
  id: string;
  ownerId: string;
  code: string;
  title: string;
  site: string;
  type: "Permit" | "JSA" | "Walkdown" | "Action";
  status: "OPEN" | "CURRENT" | "OVERDUE";
  owner: string;
  note: string;
};

export type QualityRecord = {
  id: string;
  ownerId: string;
  code: string;
  title: string;
  unit: string;
  type: "ITP" | "NDE" | "Punch" | "Hold";
  status: "OPEN" | "HOLD" | "CLEARED";
  note: string;
};

export type CostPeriod = {
  id: string;
  ownerId: string;
  estimateCode: string;
  period: string;
  budget: string;
  earned: string;
  actual: string;
  cpi: string;
  spi: string;
  forecast: string;
  note: string;
};

export type ForgebookBoard = {
  sites: SiteRecord[];
  estimates: EstimateRecord[];
  crews: CrewLine[];
  activities: ActivityLine[];
  changeOrders: ChangeOrderRecord[];
  rates: RateLine[];
  hse: HseRecord[];
  quality: QualityRecord[];
  cost: CostPeriod[];
};
