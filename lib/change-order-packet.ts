import { computeRangeHours, seatKind, type ClockOverride, type HoursSplit } from "./hours-clock.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export const FCR_STORE_PREFIX = "hs_fcr_v1:";
export const MILEAGE_YES_FLAT = 2500;

export const LOG_STATUSES = ["Open", "Pending", "Cancelled"] as const;
export const IMPACT_LEVELS = ["Low", "High", "Critical"] as const;
export const APPROVAL_STATUSES = ["Approved", "Pending"] as const;
export const FCR_BLOCKS = ["Staff Day", "Staff Night", "Craft Day", "Craft Night"] as const;
export const FCR_DAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export const FCR_DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export type LogStatus = (typeof LOG_STATUSES)[number];
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type FcrBlock = (typeof FCR_BLOCKS)[number];
export type FcrDayKey = (typeof FCR_DAYS)[number];
export type FcrDayHours = { st: number; ot: number; dt: number };
export type FcrWeek = Record<FcrDayKey, FcrDayHours>;

const DOW_TO_DAY: FcrDayKey[] = ["su", "mo", "tu", "we", "th", "fr", "sa"];

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
  week: FcrWeek;
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

export type FcrJobRow = {
  id: string;
  position: string;
  shift: string;
  clockOverride?: ClockOverride;
  st?: number;
  ot?: number;
  dt?: number;
  pd?: number;
  hours?: HoursSplit | number;
  ranges?: {
    start: string;
    end: string;
    hoursPerShift: number;
    headcount: number;
    nightHeadcount: number;
    perDiemPeople: number;
    nightPerDiemPeople?: number;
    days: boolean[];
    otAfter8?: boolean;
    shift?: "Days" | "Nights" | "Days & nights";
    skipDates?: string[];
  }[];
};

function fallbackSplit(row: FcrJobRow): FcrDayHours & { pd: number } {
  if (row.hours && typeof row.hours === "object") {
    return { st: row.hours.st, ot: row.hours.ot, dt: row.hours.dt, pd: row.hours.pd };
  }
  return { st: row.st ?? 0, ot: row.ot ?? 0, dt: row.dt ?? 0, pd: row.pd ?? 0 };
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyWeek(): FcrWeek {
  return {
    mo: { st: 0, ot: 0, dt: 0 },
    tu: { st: 0, ot: 0, dt: 0 },
    we: { st: 0, ot: 0, dt: 0 },
    th: { st: 0, ot: 0, dt: 0 },
    fr: { st: 0, ot: 0, dt: 0 },
    sa: { st: 0, ot: 0, dt: 0 },
    su: { st: 0, ot: 0, dt: 0 },
  };
}

export function weekTotals(week: FcrWeek): FcrDayHours {
  return FCR_DAYS.reduce(
    (sum, day) => ({
      st: sum.st + week[day].st,
      ot: sum.ot + week[day].ot,
      dt: sum.dt + week[day].dt,
    }),
    { st: 0, ot: 0, dt: 0 },
  );
}

export function peopleHours(row: FcrPeopleRow) {
  const totals = row.week ? weekTotals(row.week) : { st: row.st, ot: row.ot, dt: row.dt };
  return totals.st + totals.ot + totals.dt;
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
  const night = /^nights?$/i.test(shift.trim());
  if (staff && night) return "Staff Night";
  if (staff) return "Staff Day";
  if (night) return "Craft Night";
  return "Craft Day";
}

function addDay(week: FcrWeek, weekday: number, split: FcrDayHours) {
  const key = DOW_TO_DAY[weekday];
  if (!key) return;
  week[key].st += split.st;
  week[key].ot += split.ot;
  week[key].dt += split.dt;
}

function weekFromRanges(
  row: FcrJobRow,
  shift: "Days" | "Nights",
  site = "",
  client = "",
  crewOtAfter8 = false,
): { week: FcrWeek; pd: number; headcount: number } {
  const week = emptyWeek();
  let pd = 0;
  let headcount = 0;
  for (const range of row.ranges ?? []) {
    const night = shift === "Nights";
    const hours = computeRangeHours({
      position: row.position,
      site,
      client,
      start: range.start,
      end: range.end,
      hoursPerShift: range.hoursPerShift,
      headcount: night ? range.nightHeadcount : range.headcount,
      shift,
      days: range.days,
      perDiemPeople: night ? range.nightPerDiemPeople ?? 0 : range.perDiemPeople,
      otAfter8: range.otAfter8 ?? crewOtAfter8,
      clockOverride: row.clockOverride ?? "auto",
      skipDates: range.skipDates,
    });
    for (const day of hours.days) addDay(week, day.weekday, day);
    pd += hours.pd;
    headcount = Math.max(headcount, night ? range.nightHeadcount : range.headcount);
  }
  return { week, pd, headcount: headcount || 1 };
}

function peopleRowFromShift(
  row: FcrJobRow,
  shift: "Days" | "Nights",
  site = "",
  client = "",
  crewOtAfter8 = false,
): FcrPeopleRow {
  const fallback = fallbackSplit(row);
  const computed = row.ranges?.length
    ? weekFromRanges(row, shift, site, client, crewOtAfter8)
    : { week: emptyWeek(), pd: fallback.pd, headcount: 1 };
  const totals = row.ranges?.length
    ? weekTotals(computed.week)
    : { st: fallback.st, ot: fallback.ot, dt: fallback.dt };
  return {
    id: `${row.id}-${shift === "Nights" ? "n" : "d"}`,
    block: fcrBlockFor(row.position, shift),
    position: row.position,
    weeks: 1,
    mileage: false,
    daysPd: computed.pd,
    headcount: computed.headcount,
    week: computed.week,
    st: totals.st,
    ot: totals.ot,
    dt: totals.dt,
  };
}

export function peopleFromJob(rows: FcrJobRow[], site = "", client = "", crewOtAfter8 = false): FcrPeopleRow[] {
  const out: FcrPeopleRow[] = [];
  for (const row of rows) {
    if (!row.position.trim()) continue;
    const dual = /days\s*&\s*nights/i.test(row.shift);
    if (dual && row.ranges?.length) {
      out.push(peopleRowFromShift(row, "Days", site, client, crewOtAfter8));
      out.push(peopleRowFromShift(row, "Nights", site, client, crewOtAfter8));
      continue;
    }
    const night = /^nights?$/i.test(row.shift.trim());
    out.push(peopleRowFromShift(row, night ? "Nights" : "Days", site, client, crewOtAfter8));
  }
  return out;
}

export function normalizePeople(rows: Array<Partial<FcrPeopleRow>>): FcrPeopleRow[] {
  return rows.map((row) => {
    const week = row.week ?? emptyWeek();
    const totals = weekTotals(week);
    const usedWeek = totals.st + totals.ot + totals.dt > 0;
    return {
      id: row.id || uid("ppl"),
      block: row.block || "Craft Day",
      position: row.position || "",
      weeks: Number(row.weeks) || 1,
      mileage: Boolean(row.mileage),
      daysPd: Number(row.daysPd) || 0,
      headcount: Number(row.headcount) || 1,
      week,
      st: usedWeek ? totals.st : Number(row.st) || 0,
      ot: usedWeek ? totals.ot : Number(row.ot) || 0,
      dt: usedWeek ? totals.dt : Number(row.dt) || 0,
    };
  });
}

export function fcrSummary(packet: FcrPacket, laborRate = 0, pdRate = 0) {
  const staff = packet.people.filter((row) => row.block.startsWith("Staff"));
  const craft = packet.people.filter((row) => row.block.startsWith("Craft"));
  const hours = (rows: FcrPeopleRow[]) => rows.reduce((sum, row) => sum + peopleHours(row), 0);
  const pdDays = packet.people.reduce((sum, row) => sum + Math.max(0, row.daysPd), 0);
  const mileage = packet.people.reduce((sum, row) => sum + mileageDollars(row.mileage), 0);
  const staffHours = hours(staff);
  const craftHours = hours(craft);
  return {
    staffHours,
    craftHours,
    staffLabor: staffHours * laborRate,
    craftLabor: craftHours * laborRate,
    perDiem: pdDays * pdRate,
    mileage,
    sub: Math.max(0, packet.sub),
    equipment: Math.max(0, packet.equipment),
    misc: Math.max(0, packet.misc),
    total:
      staffHours * laborRate +
      craftHours * laborRate +
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
      people: Array.isArray(parsed.people) ? normalizePeople(parsed.people) : [],
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
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}
