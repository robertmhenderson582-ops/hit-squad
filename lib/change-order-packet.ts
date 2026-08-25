import { seatKind, type HoursSplit } from "./hours-clock.ts";

export const FCR_STORE_PREFIX = "hs_fcr_v1:";
export const MILEAGE_YES_FLAT = 2500;

export const LOG_STATUSES = ["Open", "Pending", "Cancelled"] as const;
export const IMPACT_LEVELS = ["Low", "High", "Critical"] as const;
export const APPROVAL_STATUSES = ["Approved", "Pending"] as const;
export const FCR_BLOCKS = ["Staff Day", "Staff Night", "Craft Day", "Craft Night"] as const;

export type LogStatus = (typeof LOG_STATUSES)[number];
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type FcrBlock = (typeof FCR_BLOCKS)[number];

export type FcrLogHeader = {
  pm: string;
  costTracker: string;
  publishDate: string;
  nte: string;
  projectScope: string;
};

export type FcrLogRow = {
  id: string;
  scr: string;
  requestDate: string;
  requestedBy: string;
  reviewedBy: string;
  status: LogStatus;
  scope: string;
  impact: string;
  impactLevel: ImpactLevel;
  approvedBy: string;
  approvalStatus: ApprovalStatus;
  approvalDate: string;
  approvedMh: number;
  approvedCost: number;
  planChanges: string;
  revisedComp: string;
  notes: string;
  loggedBy: string;
};

export type FcrPeopleRow = {
  id: string;
  block: FcrBlock;
  position: string;
  weeks: number;
  mileage: boolean;
  daysPd: number;
  headcount: number;
  st: number;
  ot: number;
  dt: number;
};

export type FcrScr = {
  taRm: string;
  categories: string;
  moc: string;
  sap: string;
  costNote: string;
  scheduleNote: string;
  signOff: string;
};

export type FcrPacket = {
  header: FcrLogHeader;
  log: FcrLogRow[];
  people: FcrPeopleRow[];
  sub: number;
  equipment: number;
  misc: number;
  scr: FcrScr;
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyFcrHeader(): FcrLogHeader {
  return { pm: "", costTracker: "", publishDate: "", nte: "", projectScope: "" };
}

export function blankLogRow(): FcrLogRow {
  return {
    id: uid("fcr"),
    scr: "",
    requestDate: "",
    requestedBy: "",
    reviewedBy: "",
    status: "Open",
    scope: "",
    impact: "",
    impactLevel: "Low",
    approvedBy: "",
    approvalStatus: "Pending",
    approvalDate: "",
    approvedMh: 0,
    approvedCost: 0,
    planChanges: "",
    revisedComp: "",
    notes: "",
    loggedBy: "",
  };
}

export function emptyScr(): FcrScr {
  return { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" };
}

export function emptyFcrPacket(): FcrPacket {
  return { header: emptyFcrHeader(), log: [], people: [], sub: 0, equipment: 0, misc: 0, scr: emptyScr() };
}

export function mileageDollars(mileage: boolean) {
  return mileage ? MILEAGE_YES_FLAT : 0;
}

export function fcrBlockFor(position: string, shift: string): FcrBlock {
  const staff = seatKind(position) === "staff";
  const night = /night/i.test(shift);
  if (staff && night) return "Staff Night";
  if (staff) return "Staff Day";
  if (night) return "Craft Night";
  return "Craft Day";
}

export function peopleFromJob(
  rows: { id: string; position: string; shift: string; hours?: HoursSplit & { pd?: number } }[],
): FcrPeopleRow[] {
  return rows
    .filter((row) => row.position.trim())
    .map((row) => ({
      id: row.id,
      block: fcrBlockFor(row.position, row.shift),
      position: row.position,
      weeks: 1,
      mileage: false,
      daysPd: row.hours?.pd ?? 0,
      headcount: 1,
      st: row.hours?.st ?? 0,
      ot: row.hours?.ot ?? 0,
      dt: row.hours?.dt ?? 0,
    }));
}

export function fcrSummary(packet: FcrPacket, laborRate = 0, pdRate = 0) {
  const staff = packet.people.filter((row) => row.block.startsWith("Staff"));
  const craft = packet.people.filter((row) => row.block.startsWith("Craft"));
  const hours = (rows: FcrPeopleRow[]) => rows.reduce((sum, row) => sum + row.st + row.ot + row.dt, 0);
  const pdDays = packet.people.reduce((sum, row) => sum + Math.max(0, row.daysPd), 0);
  const mileage = packet.people.reduce((sum, row) => sum + mileageDollars(row.mileage), 0);
  return {
    staffLabor: hours(staff) * laborRate,
    craftLabor: hours(craft) * laborRate,
    perDiem: pdDays * pdRate,
    mileage,
    sub: Math.max(0, packet.sub),
    equipment: Math.max(0, packet.equipment),
    misc: Math.max(0, packet.misc),
    total:
      hours(staff) * laborRate +
      hours(craft) * laborRate +
      pdDays * pdRate +
      mileage +
      Math.max(0, packet.sub) +
      Math.max(0, packet.equipment) +
      Math.max(0, packet.misc),
  };
}

export function readFcrPacket(key: string): FcrPacket {
  if (typeof window === "undefined" || !key) return emptyFcrPacket();
  try {
    const raw = window.localStorage.getItem(`${FCR_STORE_PREFIX}${key}`);
    if (!raw) return emptyFcrPacket();
    const parsed = JSON.parse(raw) as Partial<FcrPacket>;
    return {
      header: { ...emptyFcrHeader(), ...parsed.header },
      log: Array.isArray(parsed.log) ? parsed.log : [],
      people: Array.isArray(parsed.people) ? parsed.people : [],
      sub: Number(parsed.sub) || 0,
      equipment: Number(parsed.equipment) || 0,
      misc: Number(parsed.misc) || 0,
      scr: { ...emptyScr(), ...parsed.scr },
    };
  } catch {
    return emptyFcrPacket();
  }
}

export function writeFcrPacket(key: string, packet: FcrPacket) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${FCR_STORE_PREFIX}${key}`, JSON.stringify(packet));
  } catch {
    // keep the previous copy
  }
}
